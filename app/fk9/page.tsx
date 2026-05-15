"use client";

import NextImage from "next/image";
import { FormEvent, useState } from "react";

async function pollResult(generationId: string) {
  return new Promise<any>((resolve, reject) => {
    let attempts = 0;
    const intervalId = setInterval(async () => {
      try {
        const res = await fetch(`/api/fk9?id=${generationId}`, { cache: "no-store" });
        
        // 1. Still processing
        if (res.status === 202) {
            attempts++;
            if (attempts > 60) { // 5 Minute Timeout
                clearInterval(intervalId);
                reject(new Error("Generation timed out. The GPU might be stuck."));
            }
            return;
        }
        
        // 2. Server threw an error (e.g., missing node, comfy offline)
        if (!res.ok) {
            clearInterval(intervalId);
            const errorData = await res.json().catch(() => ({}));
            reject(new Error(errorData.errors?.[0] || `Server error: ${res.status}`));
            return;
        }

        // 3. Success!
        const { image } = await res.json();
        clearInterval(intervalId);
        resolve(image);

      } catch (error) {
        clearInterval(intervalId);
        reject(error);
      }
    }, 5000);
  });
}

export default function FK9Page() {
  const [loading, setLoading] = useState(false);
  const [image, setImage] = useState<any>();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleOnSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setImage(undefined);
    setErrorMessage(null); // Clear previous errors

    const form = e.currentTarget as HTMLFormElement;
    
    try {
      // Send the initial request
      const startGeneration = await fetch("/api/fk9", {
        method: "post",
        body: new FormData(form),
      });

      // If the initial request fails immediately
      if (!startGeneration.ok) {
          const errText = await startGeneration.text();
          throw new Error(errText || "Failed to connect to backend API.");
      }

      const data = await startGeneration.json();
      
      // Start polling for the result
      const result = await pollResult(data.id);
      setImage(result);

    } catch (error: any) {
      console.error("Generation failed:", error);
      // Display the exact error message to the user
      setErrorMessage(error.message || "An unknown error occurred.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-neutral-950 text-neutral-100 flex flex-col items-center py-12 px-4 font-sans">
      <div className="max-w-3xl w-full text-center mb-8">
        <h1 className="text-4xl font-bold text-white mb-2 tracking-tight">FK9 Image Modifier</h1>
        <p className="text-neutral-400">Upload a base image and describe how you want to transform it.</p>
      </div>

      <div className="w-full max-w-3xl bg-neutral-900 border border-neutral-800 rounded-2xl p-6 mb-8 shadow-xl">
        <form onSubmit={handleOnSubmit} className="flex flex-col gap-6">
          
          <div>
            <label className="block text-sm font-medium text-neutral-400 mb-2">Reference Image</label>
            <div className="bg-neutral-950 border border-neutral-800 p-4 rounded-xl hover:border-blue-500/50 transition-colors">
              <input 
                type="file" 
                name="image" 
                accept="image/*" 
                required 
                disabled={loading}
                className="w-full text-sm text-neutral-400 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-blue-600 file:text-white hover:file:bg-blue-500 disabled:opacity-50 cursor-pointer" 
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-neutral-400 mb-2">Prompt</label>
            <textarea
              name="prompt"
              rows={4}
              placeholder="Describe the final image..."
              disabled={loading}
              className="w-full bg-neutral-950 border border-neutral-700 text-white rounded-xl p-4 outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
              required
            />
          </div>
          
          <button
            className={`w-full py-4 rounded-xl font-bold text-white transition-all duration-200 mt-2 ${loading ? "bg-blue-600/50 animate-pulse cursor-not-allowed" : "bg-blue-600 hover:bg-blue-500 shadow-lg hover:shadow-blue-500/20"}`}
            type="submit"
            disabled={loading}
          >
            {loading ? "Processing Image (This will take a moment)..." : "Generate Final Image"}
          </button>
        </form>
      </div>

      {/* Error Banner */}
      {errorMessage && (
          <div className="w-full max-w-3xl bg-red-900/50 border border-red-500/50 text-red-200 p-4 rounded-xl mb-8 animate-in fade-in slide-in-from-top-4">
              <h3 className="font-bold flex items-center gap-2">
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
                  Generation Failed
              </h3>
              <p className="mt-1 text-sm font-mono">{errorMessage}</p>
          </div>
      )}

      {/* Image Result Display */}
      {image && !loading && (
        <div className="w-full max-w-2xl bg-neutral-900 border border-neutral-800 rounded-2xl p-4 shadow-2xl animate-in fade-in zoom-in duration-500">
          <div className="relative w-full aspect-square rounded-xl overflow-hidden bg-neutral-950">
            <NextImage alt="Result" src={image.dataUri} fill className="object-contain" />
          </div>
           <div className="mt-4 text-center">
              <a href={image.dataUri} download="fk9-output.png" className="text-sm text-neutral-400 hover:text-white transition-colors">
                Download Image
              </a>
            </div>
        </div>
      )}
    </main>
  );
}