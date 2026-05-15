import { ComfyUIApiClient } from "@stable-canvas/comfyui-client";
import sharp from "sharp";
import { v4 as uuidv4 } from "uuid";
import WebSocket from "ws";
import fs from "fs";
import path from "path";

const TASKS: Record<string, any> = {};
export const dynamic = "force-dynamic";

async function uploadToComfyUI(file: File): Promise<string> {
  const formData = new FormData();
  formData.append("image", file);
  formData.append("overwrite", "true");

  const res = await fetch("http://127.0.0.1:8188/upload/image", {
    method: "POST",
    body: formData,
  });
  
  if (!res.ok) throw new Error("Failed to upload image to ComfyUI");
  const data = await res.json();
  return data.name; 
}

export async function POST(request: Request) {
  try {
    const body = await request.formData();
    const prompt = body.get("prompt") as string;
    const imageFile = body.get("image") as File;

    if (!prompt || !imageFile) {
      return new Response("Missing prompt or image", { status: 400 });
    }

    console.log("📥 Uploading reference image...");
    const uploadedFilename = await uploadToComfyUI(imageFile);

    const comfyUIApiClient = new ComfyUIApiClient({
      api_host: "127.0.0.1:8188",
      clientId: uuidv4(),
      WebSocket,
      cache: { enabled: false },
    });
    await comfyUIApiClient.connect();

    // THE FIX: Read the JSON fresh from the hard drive every single time
    let workflowWithInput;
    try {
      const filePath = path.join(process.cwd(), "comfyui", "workflows", "fk9_test.json");
      const rawData = fs.readFileSync(filePath, "utf8");
      workflowWithInput = JSON.parse(rawData);
      console.log("📄 Successfully read fresh fk9_test.json from disk.");
    } catch (err) {
      console.error("❌ ERROR finding or parsing JSON:", err);
      return new Response("Server error reading workflow JSON", { status: 500 });
    }

    // Inject exact node IDs from fk9_test.json
    if (workflowWithInput["158"]) workflowWithInput["158"].inputs.text = prompt;
    if (workflowWithInput["76"]) workflowWithInput["76"].inputs.image = uploadedFilename;

    // Randomize the noise seed
    if (workflowWithInput["152"]) {
      workflowWithInput["152"].inputs.noise_seed = Math.floor(Math.random() * Number.MAX_SAFE_INTEGER);
    }

    const taskId = uuidv4();
    TASKS[taskId] = { id: taskId, status: "inprogress" };

    (async () => {
      try {
        console.log(`🚀 Queuing Job ID: ${taskId}`);
        await comfyUIApiClient._enqueue_prompt(workflowWithInput);
        
        const onExecuted = comfyUIApiClient.on("executed", async (data) => {
          // Node 9 is your SaveImage node
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
              console.log("🎉 Success! Ready for frontend.");

          } catch (err) {
              console.error("❌ ERROR retrieving image:", err);
              TASKS[taskId] = { id: taskId, status: "error", error: String(err) };
          } finally {
              onExecuted(); 
              await comfyUIApiClient.disconnect();
          }
        });
      } catch (error) {
        console.error("❌ ERROR Enqueuing:", error);
        TASKS[taskId] = { id: taskId, status: "error", error: String(error) };
        await comfyUIApiClient.disconnect();
      }
    })();
    
    return Response.json({ id: taskId, status: "inprogress" });
  } catch (error: any) {
    console.error("❌ Global POST Error:", error);
    return new Response(error.message || "Internal Server Error", { status: 500 });
  }
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