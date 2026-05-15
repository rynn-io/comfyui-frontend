"use client";

import { useState, FormEvent, useRef } from "react";
import Image from "next/image";
import { Sparkles, Image as ImageIcon, Download, Loader2, AlertCircle, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

export default function Home() {
  const [prompt, setPrompt] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [image, setImage] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!prompt.trim() || !imageFile) return;

    setLoading(true);
    setError(null);
    setImage(null);

    try {
      const formData = new FormData();
      formData.append("prompt", prompt);
      formData.append("image", imageFile);

      const response = await fetch("/api/fk9", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || "Failed to start generation. Is the backend running?");
      }

      const data = await response.json();

      // Poll for result
      await pollResult(data.id);
    } catch (err: any) {
      console.error(err);
      setError(err.message || "An unexpected error occurred.");
      setLoading(false);
    }
  };

  const pollResult = async (taskId: string) => {
    let attempts = 0;
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/fk9?id=${taskId}`, { cache: "no-store" });
        
        if (res.status === 202) {
          attempts++;
          if (attempts > 120) { // 10 minutes timeout
            clearInterval(interval);
            setError("Generation timed out.");
            setLoading(false);
          }
          return;
        }

        if (!res.ok) {
          clearInterval(interval);
          const errData = await res.json().catch(() => ({}));
          setError(errData.errors?.[0] || `Server error: ${res.status}`);
          setLoading(false);
          return;
        }

        const data = await res.json();
        clearInterval(interval);
        setImage(data.image);
        setLoading(false);
      } catch (err) {
        clearInterval(interval);
        setError("Network error while polling for results.");
        setLoading(false);
      }
    }, 5000);
  };

  return (
    <main className="flex-1 flex flex-col items-center py-16 px-4 sm:px-6 lg:px-8 bg-background relative overflow-hidden">
      {/* Background gradients for aesthetic appeal */}
      <div className="absolute top-0 left-1/2 w-[800px] h-[400px] bg-primary/20 rounded-full blur-[120px] -translate-x-1/2 -translate-y-1/2 pointer-events-none" />
      <div className="absolute bottom-0 right-0 w-[600px] h-[600px] bg-blue-500/10 rounded-full blur-[100px] translate-x-1/3 translate-y-1/3 pointer-events-none" />

      <div className="w-full max-w-4xl space-y-12 z-10">
        <div className="text-center space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-700">
          <div className="inline-flex items-center rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-sm font-medium text-primary mb-4 backdrop-blur-sm">
            <Sparkles className="mr-2 h-4 w-4" />
            FK9 Image Modifier
          </div>
          <h1 className="text-4xl md:text-6xl font-bold tracking-tight text-foreground">
            Transform Any Image.
          </h1>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            Upload a reference image and describe your vision. Our powerful AI will redefine it in stunning detail.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          <div className="lg:col-span-5 space-y-6">
            <Card className="border-muted/50 bg-card/50 backdrop-blur-sm shadow-xl">
              <CardHeader>
                <CardTitle>Modify Image</CardTitle>
                <CardDescription>
                  Provide a base image and a detailed prompt.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSubmit} className="space-y-4">
                  
                  {/* File Upload Area */}
                  <div 
                    onClick={() => fileInputRef.current?.click()}
                    className="border-2 border-dashed border-border hover:border-primary/50 transition-colors rounded-xl p-6 flex flex-col items-center justify-center text-center cursor-pointer bg-background/50 h-32"
                  >
                    <input 
                      type="file" 
                      accept="image/*" 
                      className="hidden" 
                      ref={fileInputRef}
                      onChange={(e) => {
                        if (e.target.files && e.target.files[0]) {
                          setImageFile(e.target.files[0]);
                        }
                      }}
                      disabled={loading}
                    />
                    {imageFile ? (
                      <div className="flex flex-col items-center">
                        <ImageIcon className="h-8 w-8 text-primary mb-2" />
                        <span className="text-sm font-medium truncate w-48">{imageFile.name}</span>
                        <span className="text-xs text-muted-foreground mt-1">Click to change</span>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center">
                        <Upload className="h-8 w-8 text-muted-foreground mb-2" />
                        <span className="text-sm font-medium">Upload Reference Image</span>
                        <span className="text-xs text-muted-foreground mt-1">JPEG, PNG, WEBP</span>
                      </div>
                    )}
                  </div>

                  <Textarea
                    placeholder="Describe how you want to transform it..."
                    className="min-h-[140px] resize-none bg-background/50 focus-visible:ring-primary/50"
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    disabled={loading}
                  />
                  <Button 
                    type="submit" 
                    className="w-full h-12 text-md transition-all"
                    disabled={loading || !prompt.trim() || !imageFile}
                  >
                    {loading ? (
                      <>
                        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                        Processing Image...
                      </>
                    ) : (
                      <>
                        <Sparkles className="mr-2 h-5 w-5" />
                        Generate Final Image
                      </>
                    )}
                  </Button>
                </form>
              </CardContent>
            </Card>

            {error && (
              <Alert variant="destructive" className="animate-in fade-in slide-in-from-top-2">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Error</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
          </div>

          <div className="lg:col-span-7 flex flex-col">
            <Card className="flex-1 flex flex-col overflow-hidden border-muted/50 bg-card/50 backdrop-blur-sm shadow-xl min-h-[400px]">
              <CardContent className="flex-1 flex items-center justify-center p-0 relative group">
                {loading ? (
                  <div className="absolute inset-0 flex flex-col items-center justify-center bg-muted/20 backdrop-blur-sm z-10">
                    <Loader2 className="h-12 w-12 text-primary animate-spin mb-4" />
                    <p className="text-muted-foreground animate-pulse font-medium">
                      Synthesizing image...
                    </p>
                  </div>
                ) : image ? (
                  <div className="relative w-full h-full min-h-[500px] animate-in zoom-in-95 duration-500">
                    <Image
                      src={image.dataUri}
                      alt="Generated image"
                      fill
                      className="object-contain"
                    />
                    <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center">
                      <Button variant="secondary" size="lg" asChild className="gap-2">
                        <a href={image.dataUri} download="fk9-output.png">
                          <Download className="h-5 w-5" />
                          Download High-Res
                        </a>
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center text-muted-foreground/50 p-12 text-center">
                    <ImageIcon className="h-20 w-20 mb-4 opacity-50" />
                    <p className="text-lg">Your transformed image will appear here</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </main>
  );
}
