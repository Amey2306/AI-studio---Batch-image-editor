import React, { useState, useEffect, useCallback, useRef } from 'react';
import { editImage, extractTextWithBoundingBoxes, TextWithBoundingBox } from '../services/geminiService';
import ImageUpload from './ImageUpload';
import Spinner from './Spinner';
import { UploadedImage } from '../types';

interface TextItem {
  id: number;
  original: string;
  modified: string;
  boundingBox: { x1: number; y1: number; x2: number; y2: number; };
}

type BatchStatus = 'pending' | 'loading' | 'success' | 'error';
interface BatchProgress {
    status: BatchStatus;
    result?: string;
    error?: string;
}

const ImageEditor: React.FC = () => {
  const [uploadedImages, setUploadedImages] = useState<UploadedImage[]>([]);
  const [masterIndex, setMasterIndex] = useState<number | null>(null);
  const [batchSelection, setBatchSelection] = useState<Set<number>>(new Set());
  
  const [textItems, setTextItems] = useState<TextItem[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  
  const [batchProgress, setBatchProgress] = useState<Record<number, BatchProgress>>({});
  const [isBatchProcessing, setIsBatchProcessing] = useState<boolean>(false);
  
  const imageRefs = useRef<(HTMLImageElement | null)[]>([]);

  const analyzeMasterImage = useCallback(async () => {
    if (masterIndex === null || !uploadedImages[masterIndex]) return;

    setIsAnalyzing(true);
    setTextItems([]);
    setAnalysisError(null);
    setBatchProgress({});

    try {
      const selectedFile = uploadedImages[masterIndex].file;
      const extractedText = await extractTextWithBoundingBoxes(selectedFile);
      setTextItems(extractedText.map((item, index) => ({
        id: index,
        original: item.text,
        modified: item.text,
        boundingBox: item.boundingBox,
      })));
    } catch (err) {
      setAnalysisError(err instanceof Error ? err.message : 'An unknown error occurred during analysis.');
    } finally {
      setIsAnalyzing(false);
    }
  }, [masterIndex, uploadedImages]);

  useEffect(() => {
    imageRefs.current = imageRefs.current.slice(0, uploadedImages.length);
  }, [uploadedImages]);
  
  useEffect(() => {
    analyzeMasterImage();
  }, [analyzeMasterImage]);
  
  const handleFileSelect = async (files: File[]) => {
    const newImages: UploadedImage[] = await Promise.all(
      files.map(file => new Promise<UploadedImage>((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          resolve({ file, base64: reader.result as string });
        };
        reader.readAsDataURL(file);
      }))
    );
    
    setUploadedImages(prev => {
        const updated = [...prev, ...newImages];
        if (masterIndex === null && updated.length > 0) {
            setMasterIndex(0);
            setBatchSelection(new Set([0]));
        }
        return updated;
    });
  };

  const handleSelectMaster = (index: number) => {
    setMasterIndex(index);
    // When a new master is chosen, the analysis will re-run.
    // Also add it to the batch selection if it's not there.
    if (!batchSelection.has(index)) {
      setBatchSelection(prev => new Set(prev).add(index));
    }
  };
  
  const handleToggleBatchSelection = (index: number) => {
    setBatchSelection(prev => {
        const newSelection = new Set(prev);
        if (newSelection.has(index)) {
            // Prevent deselecting the master image
            if (index !== masterIndex) {
               newSelection.delete(index);
            }
        } else {
            newSelection.add(index);
        }
        return newSelection;
    });
  }
  
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (masterIndex === null || batchSelection.size === 0) {
      alert('Please select a master image and at least one image for the batch.');
      return;
    }

    const changes = textItems.filter(item => item.original !== item.modified);
    if (changes.length === 0) {
      alert("You haven't made any text changes to apply.");
      return;
    }

    setIsBatchProcessing(true);
    const initialProgress = Object.fromEntries(Array.from(batchSelection).map(idx => [idx, { status: 'loading' }]));
    setBatchProgress(initialProgress);

    for (const imageIndex of batchSelection) {
      try {
        const imageFile = uploadedImages[imageIndex].file;
        const imageElement = imageRefs.current[imageIndex];
        if (!imageElement) throw new Error(`Image element for index ${imageIndex} not found.`);

        // Step 1: Analyze the current image in the batch to get its specific text layout
        const currentImageTextItems = await extractTextWithBoundingBoxes(imageFile);

        // Step 2: Create a mask for the current image
        const canvas = document.createElement('canvas');
        canvas.width = imageElement.naturalWidth;
        canvas.height = imageElement.naturalHeight;
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error("Could not create canvas context");
        
        ctx.drawImage(imageElement, 0, 0);
        ctx.fillStyle = '#FF00FF';

        let hasMasks = false;
        const specificChanges = changes.map(change => {
          // Find the corresponding text in the current image to get the right bounding box
          const foundText = currentImageTextItems.find(item => item.text.trim() === change.original.trim());
          if (foundText) {
            hasMasks = true;
            const { x1, y1, x2, y2 } = foundText.boundingBox;
            const rectX = x1 * canvas.width;
            const rectY = y1 * canvas.height;
            const rectW = (x2 - x1) * canvas.width;
            const rectH = (y2 - y1) * canvas.height;
            ctx.fillRect(rectX, rectY, rectW, rectH);
            return `- In the area where "${change.original}" was, write "${change.modified}"`;
          }
          return null;
        }).filter(Boolean);

        if (!hasMasks) {
            throw new Error(`The text to be changed was not found on this image variant.`);
        }

        const maskedImageBase64 = canvas.toDataURL(imageFile.type);

        // Step 3: Construct prompt and call edit API
        let finalPrompt = "I have provided an original image and a version with bright magenta areas (a mask). Your ONLY task is to precisely fill in these magenta areas with new text. The result must be sharp, high-fidelity, and indistinguishable from the original's style, font, color, and perspective. Here are the specific replacements:\n";
        finalPrompt += specificChanges.join('\n');
        finalPrompt += "\nDo not alter any part of the image outside the magenta areas.";

        const result = await editImage(finalPrompt, imageFile, maskedImageBase64);
        setBatchProgress(prev => ({ ...prev, [imageIndex]: { status: 'success', result } }));

      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'An unknown error occurred.';
        setBatchProgress(prev => ({ ...prev, [imageIndex]: { status: 'error', error: errorMsg } }));
      }
    }

    setIsBatchProcessing(false);
  };
  
  const handleTextChange = (id: number, newText: string) => {
    setTextItems(prev => prev.map(item => item.id === id ? { ...item, modified: newText } : item));
  };

  return (
    <div className="space-y-6">
      {uploadedImages.length === 0 ? (
        <ImageUpload onFilesSelect={handleFileSelect} multiple label="Upload your set of creatives to begin batch editing" />
      ) : (
        <>
            <div>
              <h3 className="text-lg font-semibold mb-2">Your Creatives (Select a master, then check others for batch)</h3>
              <div className="flex flex-wrap gap-3 p-3 bg-slate-700/50 rounded-lg">
                {uploadedImages.map((img, index) => (
                  <div key={index} className="relative cursor-pointer" onClick={() => handleToggleBatchSelection(index)}>
                    <img 
                      ref={el => imageRefs.current[index] = el}
                      src={img.base64} 
                      alt={`upload-${index}`} 
                      className={`h-24 w-24 object-cover rounded-md border-4 transition-all duration-200 ${batchSelection.has(index) ? 'border-sky-500' : 'border-transparent hover:border-slate-500'}`}
                    />
                    {masterIndex === index && (
                        <div className="absolute -top-2 -left-2 bg-sky-500 text-white text-xs font-bold px-1.5 py-0.5 rounded-full" title="Master Creative for Text Analysis">M</div>
                    )}
                    {batchSelection.has(index) && (
                         <div className="absolute top-1 right-1 bg-sky-500 rounded-full h-5 w-5 flex items-center justify-center pointer-events-none">
                            <svg className="h-3.5 w-3.5 text-white" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>
                        </div>
                    )}
                     <button
                        title="Set as Master Creative"
                        onClick={(e) => { e.stopPropagation(); handleSelectMaster(index); }}
                        className={`absolute bottom-1 right-1 h-6 w-6 rounded-full bg-slate-800/70 hover:bg-sky-600 flex items-center justify-center transition ${masterIndex === index ? 'text-sky-400' : 'text-white'}`}
                      >
                       <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" /></svg>
                      </button>
                  </div>
                ))}
                <label htmlFor="add-more-files" className="h-24 w-24 bg-slate-700 rounded-md flex items-center justify-center cursor-pointer hover:bg-slate-600 transition">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
                  <input type="file" id="add-more-files" multiple accept="image/*" className="hidden" onChange={e => e.target.files && handleFileSelect(Array.from(e.target.files))}/>
                </label>
              </div>
            </div>

            <div className="pt-4 border-t border-slate-700">
                <h3 className="text-lg font-semibold text-slate-300">Define Your Edits (based on Master)</h3>
                {isAnalyzing ? (
                     <div className="flex items-center justify-center text-center gap-3 p-4 bg-slate-700/50 rounded-lg">
                        <Spinner/>
                        <p className="text-slate-400">Analyzing master creative for text...</p>
                    </div>
                ) : analysisError ? (
                     <p className="text-red-400 bg-red-900/50 p-3 rounded-lg">{analysisError}</p>
                ) : textItems.length > 0 ? (
                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div className="space-y-3 max-h-60 overflow-y-auto pr-2">
                            {textItems.map(item => (
                                <div key={item.id} className="grid grid-cols-1 sm:grid-cols-2 gap-2 items-center">
                                    <label htmlFor={`text-item-${item.id}`} className="text-sm text-slate-400 truncate bg-slate-700 p-3 rounded-lg">
                                        {item.original}
                                    </label>
                                    <input 
                                        type="text"
                                        id={`text-item-${item.id}`}
                                        value={item.modified}
                                        onChange={(e) => handleTextChange(item.id, e.target.value)}
                                        className="w-full bg-slate-900 border border-slate-600 rounded-lg p-3 text-slate-100 focus:ring-2 focus:ring-sky-500 focus:border-sky-500 transition"
                                    />
                                </div>
                            ))}
                        </div>
                        <button type="submit" disabled={isBatchProcessing} className="w-full flex justify-center items-center gap-2 bg-sky-600 text-white font-bold py-3 px-4 rounded-lg hover:bg-sky-700 transition-colors disabled:bg-slate-600 disabled:cursor-not-allowed">
                          {isBatchProcessing ? <><Spinner /> Processing Batch...</> : `Apply Edits to ${batchSelection.size} Image(s)`}
                        </button>
                    </form>
                ) : (
                    <p className="text-slate-500 p-3 bg-slate-700/50 rounded-lg">No text was detected on the master image.</p>
                )}
            </div>

            {Object.keys(batchProgress).length > 0 && (
              <div className="pt-4 border-t border-slate-700">
                <h3 className="text-lg font-semibold text-slate-300 mb-4">Batch Results</h3>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                  {/* FIX: Use Object.keys to iterate and ensure `progress` is correctly typed, resolving 'property does not exist on type unknown' errors. */}
                  {Object.keys(batchProgress).map((indexStr) => {
                    const index = parseInt(indexStr, 10);
                    const progress = batchProgress[index];
                    return (
                      <div key={index} className="space-y-2">
                        <div className="relative aspect-square bg-slate-700 rounded-lg overflow-hidden flex items-center justify-center">
                          {progress.status === 'loading' && <Spinner/>}
                          {progress.status === 'success' && progress.result && <img src={progress.result} className="w-full h-full object-contain"/>}
                          {progress.status === 'error' && (
                            <div className="text-center p-2">
                               <p className="text-sm font-semibold text-red-400">Error</p>
                               <p className="text-xs text-red-500">{progress.error}</p>
                            </div>
                          )}
                           <img src={uploadedImages[index].base64} alt="Original thumbnail" className="absolute bottom-1 right-1 h-8 w-8 object-cover rounded border-2 border-slate-500" />
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
        </>
      )}
    </div>
  );
};

export default ImageEditor;