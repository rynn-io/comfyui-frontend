import { ComfyUIApiClient } from "@stable-canvas/comfyui-client";
import sharp from "sharp";
import { v4 as uuidv4 } from "uuid";
import WebSocket from "ws";
import fs from "fs";
import path from "path";

const TASKS: Record<string, any> = {};
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = await request.formData();
  const prompt = body.get("prompt") as string;

  if (!prompt) {
    return new Response("Missing prompt", { status: 400 });
  }

  const comfyUIApiClient = new ComfyUIApiClient({
    api_host: "127.0.0.1:8188",
    clientId: uuidv4(),
    WebSocket,
    cache: { enabled: false },
  });
  await comfyUIApiClient.connect();

  try {
    const filePath = path.join(process.cwd(), "comfyui", "workflows", "test_workflow_api.json");
    const rawData = fs.readFileSync(filePath, "utf8");
    var workflowWithInput = JSON.parse(rawData);
    console.log("📄 Successfully read fresh test_workflow_api.json from disk.");
  } catch (err) {
    console.error("❌ ERROR finding or parsing JSON:", err);
    return new Response("Server error reading workflow JSON", { status: 500 });
  }

  // Inject the prompt into Node 67
  if (workflowWithInput["67"]) {
    workflowWithInput["67"].inputs.text = prompt;
  }

  // Randomize the seed in Node 70 for unique generations
  if (workflowWithInput["70"]) {
    workflowWithInput["70"].inputs.seed = Math.floor(Math.random() * Number.MAX_SAFE_INTEGER);
  }

  const taskId = uuidv4();
  TASKS[taskId] = { id: taskId, status: "inprogress" };

  (async () => {
    try {
      console.log(`🚀 Queuing Job ID: ${taskId} for Text-to-Image generation`);
      await comfyUIApiClient._enqueue_prompt(workflowWithInput);
      
      const onExecuted = comfyUIApiClient.on("executed", async (data) => {
        // Node 9 is the SaveImage node
        if(data.node != "9") return; 
        console.log("🎯 Image generated! Fetching from ComfyUI...");

        try {
            if (!data.output || !data.output.images || data.output.images.length === 0) {
                throw new Error("No image data found.");
            }

            const imgData = data.output.images[0];
            const imgUrl = comfyUIApiClient.viewURL(imgData.filename, imgData.subfolder, imgData.type);

            const response = await fetch(imgUrl);
            if (!response.ok) throw new Error(`Fetch failed: ${response.status}`);
            
            const imageBuffer = Buffer.from(await response.arrayBuffer());
            const { width, height, format } = await sharp(imageBuffer).metadata();
            
            TASKS[taskId] = {
              id: taskId,
              status: "finished",
              image: {
                dataUri: `data:image/${format};base64,${imageBuffer.toString("base64")}`,
                width: width!,
                height: height!,
                format: format!,
              },
            };
            console.log("🎉 Success! Image ready for frontend.");

        } catch (err) {
            console.error("❌ ERROR retrieving image:", err);
            TASKS[taskId] = { id: taskId, status: "error", error: String(err) };
        } finally {
            onExecuted(); 
            await comfyUIApiClient.disconnect();
        }
      });
    } catch (error) {
      console.error("❌ ERROR Enqueuing Text-to-Image workflow:", error);
      TASKS[taskId] = { id: taskId, status: "error", error: String(error) };
      await comfyUIApiClient.disconnect();
    }
  })();
  
  return Response.json({ id: taskId, status: "inprogress" });
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) return new Response("Error", { status: 404 });
  
  const task = TASKS[id];
  if (!task) return new Response("Error", { status: 404 });
  
  if (task.status === "error") {
      delete TASKS[id]; 
      return new Response(JSON.stringify({ errors: [task.error] }), { status: 500 });
  }

  if (task.status === "inprogress") return new Response("In progress", { status: 202 });
  
  const responseData = { ...task };
  delete TASKS[id]; 
  return Response.json(responseData);
}

export const revalidate = 0;
