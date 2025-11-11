import React, { useState } from 'react';
import { generateImage } from '../services/geminiService';
import { AspectRatios, AspectRatio } from '../types';
import Spinner from './Spinner';

const ImageGenerator: React.FC = () => {
  const [prompt, setPrompt] = useState<string>('');
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>('1:1');
  const [generatedImages, setGeneratedImages] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim()) {
      setError('Please enter a prompt.');
      return;
    }
    setIsLoading(true);
    setError(null);
    setGeneratedImages([]);

    try {
      const images = await generateImage(prompt, aspectRatio);
      setGeneratedImages(images);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unknown error occurred.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="prompt" className="block text-sm font-medium text-slate-300 mb-2">
            Describe the image you want to create
          </label>
          <textarea
            id="prompt"
            rows={3}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            className="w-full bg-slate-700 border border-slate-600 rounded-lg p-3 text-slate-100 focus:ring-2 focus:ring-sky-500 focus:border-sky-500 transition"
            placeholder="e.g., A photo of an astronaut riding a horse on Mars"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-300 mb-2">
            Aspect Ratio
          </label>
          <div className="flex flex-wrap gap-2">
            {AspectRatios.map((ratio) => (
              <button
                key={ratio}
                type="button"
                onClick={() => setAspectRatio(ratio)}
                className={`px-4 py-2 text-sm rounded-md transition ${
                  aspectRatio === ratio
                    ? 'bg-sky-600 text-white font-semibold'
                    : 'bg-slate-700 hover:bg-slate-600 text-slate-300'
                }`}
              >
                {ratio}
              </button>
            ))}
          </div>
        </div>

        <button
          type="submit"
          disabled={isLoading}
          className="w-full flex justify-center items-center gap-2 bg-sky-600 text-white font-bold py-3 px-4 rounded-lg hover:bg-sky-700 transition-colors disabled:bg-slate-600 disabled:cursor-not-allowed"
        >
          {isLoading ? <><Spinner /> Generating...</> : 'Generate Images'}
        </button>
      </form>

      {error && <p className="text-red-400 bg-red-900/50 p-3 rounded-lg">{error}</p>}

      {generatedImages.length > 0 && (
        <div>
          <h3 className="text-lg font-semibold mb-4">Generated Images</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {generatedImages.map((src, index) => (
              <div key={index} className="bg-slate-700 rounded-lg overflow-hidden shadow-lg">
                <img src={src} alt={`Generated image ${index + 1}`} className="w-full h-auto object-cover" />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default ImageGenerator;
