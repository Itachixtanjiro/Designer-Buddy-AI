import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { createRoot } from 'react-dom/client';
import { GoogleGenAI, Modality, Part, Type } from '@google/genai';

// --- Type declarations for CDN libraries ---
declare const jspdf: any;
declare const html2canvas: any;

// --- Helper Functions ---

async function fileToGenerativePart(file: File): Promise<Part> {
  const base64EncodedDataPromise = new Promise<string>((resolve) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64Data = (reader.result as string).split(',')[1];
      resolve(base64Data);
    };
    reader.readAsDataURL(file);
  });

  return {
    inlineData: {
      data: await base64EncodedDataPromise,
      mimeType: file.type,
    },
  };
}

const fileToBase64 = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = error => reject(error);
  });

async function urlToGenerativePart(url: string): Promise<Part> {
  const response = await fetch(url);
  const blob = await response.blob();
  const base64EncodedDataPromise = new Promise<string>((resolve) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      resolve((reader.result as string).split(',')[1]);
    };
    reader.readAsDataURL(blob);
  });
  return {
    inlineData: {
      data: await base64EncodedDataPromise,
      mimeType: blob.type,
    },
  };
}

const compressImage = (dataUrl: string, maxWidth = 1024, quality = 0.7): Promise<string> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.src = dataUrl;
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');

      if (!ctx) {
        return reject(new Error('Could not get canvas context'));
      }

      let { width, height } = img;
      if (width > height) {
        if (width > maxWidth) {
          height *= maxWidth / width;
          width = maxWidth;
        }
      } else {
        if (height > maxWidth) {
          width *= maxWidth / height;
          height = maxWidth;
        }
      }

      canvas.width = width;
      canvas.height = height;

      ctx.drawImage(img, 0, 0, width, height);
      
      const compressedDataUrl = canvas.toDataURL('image/jpeg', quality);
      resolve(compressedDataUrl);
    };
    img.onerror = (error) => {
      console.error("Image loading error for compression:", error);
      resolve(dataUrl); 
    };
  });
};

// --- Types ---

type Stage = 'upload' | 'analyzing' | 'suggestions_ready' | 'supervising' | 'designing' | 'reviewing' | 'reworking' | 'finalizing' | 'done';

type AnalysisReport = {
  styleAnalysis: string;
  colorPalette: { name: string; hex: string; }[];
  keyObjects: { name: string; description: string; }[];
  opportunities: string;
};

type ProjectPlan = {
  summary: string;
  budget: string;
  shoppingList: { item: string; description: string; cost: string; }[];
};

interface ProjectState {
  stage: Stage;
  prompt: string;
  sourceImageUrl: string | null;
  generatedImageUrls: string[];
  analysis: AnalysisReport | null;
  suggestions: string[];
  enhancedPrompt: string | null;
  selectedImageUrl: string | null;
  reworkFeedback: string;
  reworkDiagnosis: string | null;
  finalProjectPlan: ProjectPlan | null;
}

interface SavedProject {
  id: string;
  savedAt: number;
  isFavorite: boolean;
  projectState: ProjectState;
  thumbnail: string;
}

// --- Custom Hook for Undo/Redo ---

const useHistory = (initialState: ProjectState) => {
  const [state, setStateInternal] = useState({
    history: [initialState],
    currentIndex: 0,
  });

  const { history, currentIndex } = state;

  const currentState = useMemo(() => history[currentIndex], [history, currentIndex]);

  const setState = useCallback((action: React.SetStateAction<ProjectState>, overwrite = false) => {
    setStateInternal(prevState => {
      const { history: currentHistory, currentIndex } = prevState;
      
      const baseState = currentHistory[currentIndex];
      if (!baseState) {
          console.error("useHistory hook error: Attempted to update state from an invalid index.", {currentIndex, historyLength: currentHistory.length});
          return prevState; // Prevent crash by not updating
      }

      const newState = typeof action === 'function'
        ? (action as (prevState: ProjectState) => ProjectState)(baseState)
        : action;
      
      if (overwrite) {
        const newHistory = [...currentHistory];
        newHistory[currentIndex] = newState;
        return { ...prevState, history: newHistory };
      } else {
        const newHistory = currentHistory.slice(0, currentIndex + 1);
        const updatedHistory = [...newHistory, newState];
        return {
          history: updatedHistory,
          currentIndex: updatedHistory.length - 1,
        };
      }
    });
  }, []);
  
  const resetState = useCallback((newState: ProjectState) => {
    setStateInternal({
      history: [newState],
      currentIndex: 0,
    });
  }, []);

  const undo = useCallback(() => {
    setStateInternal(prevState => {
      if (prevState.currentIndex > 0) {
        return { ...prevState, currentIndex: prevState.currentIndex - 1 };
      }
      return prevState;
    });
  }, []);

  const redo = useCallback(() => {
    setStateInternal(prevState => {
      if (prevState.currentIndex < prevState.history.length - 1) {
        return { ...prevState, currentIndex: prevState.currentIndex + 1 };
      }
      return prevState;
    });
  }, []);

  const canUndo = useMemo(() => currentIndex > 0, [currentIndex]);
  const canRedo = useMemo(() => currentIndex < history.length - 1, [currentIndex, history.length]);

  return { state: currentState, setState, resetState, undo, redo, canUndo, canRedo };
};


// --- Narrator Component ---
const Narrator: React.FC<{ stage: Stage }> = ({ stage }) => {
    const messages: Record<string, string> = {
        analyzing: "I've handed your photo to my AI Analyst. They're examining every detail of your space right now...",
        supervising: "Great idea! My AI Supervisor is taking your prompt and polishing it into a detailed brief for the Designer.",
        designing: "The brief is in! My AI Designer is now creating three unique visual concepts for you. This is the exciting part!",
        reworking: "Excellent feedback. I'm passing it to my Art Director to see what we can do better next time.",
        finalizing: "Fantastic choice! My AI Project Manager is now putting together your final action plan and shopping list.",
    };

    const message = messages[stage] || "Something amazing is happening...";

    return (
        <div className="narrator-box">
            <div className="narrator-avatar">
                <div className="narrator-eye"></div>
                <div className="narrator-eye"></div>
            </div>
            <div className="narrator-text-container">
                <div className="loader" aria-label="Loading"></div>
                <p>{message}</p>
            </div>
        </div>
    );
};


const App: React.FC = () => {
  const initialState: ProjectState = {
    stage: 'upload', prompt: '', sourceImageUrl: null,
    generatedImageUrls: [], analysis: null, suggestions: [],
    enhancedPrompt: null, selectedImageUrl: null, reworkFeedback: '',
    reworkDiagnosis: null, finalProjectPlan: null,
  };
  
  const { 
    state: projectState, 
    setState: setProjectState,
    resetState,
    undo, redo, canUndo, canRedo
  } = useHistory(initialState);
  
  const [sourceImageFile, setSourceImageFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [savedProjects, setSavedProjects] = useState<SavedProject[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  
  useEffect(() => {
    try {
      const savedJSON = localStorage.getItem('designBuddyProjects');
      if (savedJSON) {
        let projects: SavedProject[] = JSON.parse(savedJSON);
        const twentyDaysAgo = Date.now() - (20 * 24 * 60 * 60 * 1000);
        
        const cleanedProjects = projects.filter(p => p.isFavorite || p.savedAt > twentyDaysAgo);
        
        if (cleanedProjects.length < projects.length) {
          localStorage.setItem('designBuddyProjects', JSON.stringify(cleanedProjects));
        }
        setSavedProjects(cleanedProjects);
      }
    } catch (e) {
      console.error("Failed to load or clean projects:", e);
      localStorage.removeItem('designBuddyProjects');
    }
  }, []);

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      handleStartOver(); // Reset everything
      setSourceImageFile(file);
      const imageUrl = URL.createObjectURL(file);
      setProjectState({ ...initialState, stage: 'analyzing', sourceImageUrl: imageUrl });
      await runAnalysisAndSuggestions(file, imageUrl);
    }
  };

  const runAnalysisAndSuggestions = async (file: File, imageUrl: string) => {
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY! });
      const imagePart = await fileToGenerativePart(file);

      const analystPrompt = `You are an expert interior design analyst. Analyze the provided room image and return a JSON object. Be descriptive and accurate. The JSON object must strictly follow this structure:
{
  "styleAnalysis": "A concise analysis of the room's interior design style (e.g., 'Modern Scandinavian', 'Bohemian', 'Industrial').",
  "colorPalette": [
    { "name": "A common name for the color (e.g., 'Warm Beige', 'Forest Green').", "hex": "The hexadecimal code for the color (e.g., '#F5F5DC')." }
  ],
  "keyObjects": [
    { "name": "The name of the object (e.g., 'Velvet Sofa', 'Marble Coffee Table').", "description": "A brief description of the object's style or condition." }
  ],
  "opportunities": "A brief summary of the best opportunities for design improvement."
}
Do not include any text, explanations, or markdown formatting outside of the JSON object itself.`;
      
      const analystResponse = await ai.models.generateContent({
        model: 'gemini-2.5-flash-image-preview',
        contents: { parts: [imagePart, { text: analystPrompt }] },
      });

      let jsonString = analystResponse.text.trim();
      if (jsonString.startsWith('```json')) {
        jsonString = jsonString.substring(7, jsonString.length - 3).trim();
      } else if (jsonString.startsWith('```')) {
         jsonString = jsonString.substring(3, jsonString.length - 3).trim();
      }
      
      const analysisData = JSON.parse(jsonString);

      const curatorContext = `Style: ${analysisData.styleAnalysis}. Opportunities: ${analysisData.opportunities}`;
      const curatorPrompt = `You are a creative curator. Based on the following analysis, generate three distinct, concise design suggestions. The output MUST be a valid JSON object with a single key 'suggestions' which is an array of three strings. Provide two logical evolutions of the current style, and one 'Creative Wildcard' that proposes a bold, different aesthetic. Do not add any text outside the JSON object.\n\nRoom Analysis:\n${curatorContext}`;
      
      const curatorResponse = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: curatorPrompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: { suggestions: { type: Type.ARRAY, items: { type: Type.STRING } } },
            required: ['suggestions']
          }
        }
      });
      
      const suggestionsData = JSON.parse(curatorResponse.text);
      if (!suggestionsData || !suggestionsData.suggestions) {
        throw new Error("Could not get design suggestions from the AI.");
      }

      setProjectState(prevState => ({
        ...prevState,
        stage: 'suggestions_ready',
        sourceImageUrl: imageUrl,
        analysis: analysisData,
        suggestions: suggestionsData.suggestions,
      }));

    } catch (err: any) {
      console.error(err);
      setError(err.message || 'An unexpected error occurred during analysis.');
      resetState({ ...initialState, stage: 'upload', sourceImageUrl: projectState.sourceImageUrl });
    }
  };

  const handleDesignRequest = async (designPrompt: string) => {
    if (!projectState.sourceImageUrl || !designPrompt.trim()) {
      setError('Please provide a design prompt and ensure an image is loaded.');
      return;
    }
    
    setProjectState(prevState => ({
      ...prevState,
      stage: 'supervising',
      prompt: designPrompt,
      generatedImageUrls: [],
      enhancedPrompt: null,
      selectedImageUrl: null,
    }));
    setError(null);
    
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY! });
      
      const supervisorPrompt = `You are a creative director. Take the user's simple prompt and enhance it into a professional, detailed brief for a visual AI. Add details about lighting, materials, and mood. Be creative and evocative, but keep the brief to a few concise sentences. Return only the enhanced prompt, no conversational text. \n\nSimple Input: "${designPrompt}"`;
      
      const supervisorResponse = await ai.models.generateContent({
        model: 'gemini-2.5-flash', contents: supervisorPrompt,
      });

      const supervisedPrompt = supervisorResponse.text.trim();
      setProjectState(prevState => ({ ...prevState, stage: 'designing', prompt: designPrompt, enhancedPrompt: supervisedPrompt }), true);
      
      const imagePart = sourceImageFile
        ? await fileToGenerativePart(sourceImageFile)
        : await urlToGenerativePart(projectState.sourceImageUrl!);

      const fullPromptForDesigner = `${supervisedPrompt}\n\n**Structural Integrity Constraint:** You MUST preserve the exact architectural shell of the attached room—walls, windows, and doors cannot be changed. Focus all creative changes on decor, furniture, colors, and lighting.`;
      
      const generationPromises = Array(3).fill(0).map(() => 
        ai.models.generateContent({
          model: 'gemini-2.5-flash-image-preview',
          contents: { parts: [imagePart, { text: fullPromptForDesigner }] },
          config: { responseModalities: [Modality.IMAGE, Modality.TEXT] },
        })
      );
      
      const responses = await Promise.all(generationPromises);
      
      const imageUrls: string[] = [];
      responses.forEach(response => {
        for (const part of response.candidates?.[0]?.content?.parts || []) {
          if (part.inlineData) {
            imageUrls.push(`data:${part.inlineData.mimeType};base64,${part.inlineData.data}`);
            return;
          }
        }
      });

      if (imageUrls.length === 0) {
          throw new Error('API did not return any images. Please try a different prompt.');
      }
      
      setProjectState(prevState => ({ ...prevState, prompt: designPrompt, enhancedPrompt: supervisedPrompt, generatedImageUrls: imageUrls, stage: 'reviewing' }));

    } catch (err: any) {
      console.error(err);
      setError(err.message || 'An unexpected error occurred. Please try again.');
      setProjectState(prevState => ({ ...prevState, stage: 'suggestions_ready' }));
    }
  };

  const handleReworkRequest = async () => {
    if (!projectState.reworkFeedback.trim()) {
      setError("Please provide some feedback for the Art Director.");
      return;
    }
    setProjectState(prevState => ({ ...prevState, stage: 'reworking' }));
    setError(null);

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY! });
      const artDirectorPrompt = `You are an Art Director. Based on the user's feedback, provide a concise, two-part response: 1. A brief "Design Diagnosis" of what might have missed the mark. 2. A clear, one-sentence "Recommended Next Step" to guide their next prompt. Be direct and helpful. Use 'Design Diagnosis:' and 'Recommended Next Step:' headings.\n\nUser Feedback: "${projectState.reworkFeedback}"`;

      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash', contents: artDirectorPrompt,
      });
      
      setProjectState(prevState => ({ ...prevState, stage: 'suggestions_ready', reworkDiagnosis: response.text, prompt: '' }));
      
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'An unexpected error occurred during rework.');
      setProjectState(prevState => ({ ...prevState, stage: 'reviewing' }));
    }
  };

  const handleFinalizeRequest = async () => {
    if (!projectState.selectedImageUrl) {
      setError("Please select your favorite design to finalize.");
      return;
    }
    setProjectState(prevState => ({ ...prevState, stage: 'finalizing' }));
    setError(null);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY! });
      const imagePart = await urlToGenerativePart(projectState.selectedImageUrl);

      const imageDescriptionPrompt = "You are an expert interior design analyst. Describe this image in detail. Focus on the style, furniture, colors, materials, and overall mood. This description will be used by another AI to create a shopping list. Be thorough. Use plain text.";
      const descriptionResponse = await ai.models.generateContent({
        model: 'gemini-2.5-flash-image-preview',
        contents: { parts: [imagePart, { text: imageDescriptionPrompt }] },
      });
      const imageDescription = descriptionResponse.text;
      
      const projectManagerPrompt = `You are a practical project manager. Based on the following design description, create an actionable project plan. Respond with a JSON object that strictly follows the provided schema. The summary should be a brief, encouraging paragraph about the project. The budget should be a realistic estimated range. The shopping list should include specific items needed to achieve the look.\n\nDesign Description:\n${imageDescription}`;

      const planSchema = {
        type: Type.OBJECT,
        properties: {
            summary: { type: Type.STRING },
            budget: { type: Type.STRING },
            shoppingList: {
                type: Type.ARRAY,
                items: {
                    type: Type.OBJECT,
                    properties: {
                        item: { type: Type.STRING },
                        description: { type: Type.STRING },
                        cost: { type: Type.STRING }
                    },
                    required: ["item", "description", "cost"]
                }
            }
        },
        required: ["summary", "budget", "shoppingList"]
      };

      const planResponse = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: projectManagerPrompt,
        config: { responseMimeType: "application/json", responseSchema: planSchema }
      });

      const planData = JSON.parse(planResponse.text);
      setProjectState(prevState => ({ ...prevState, stage: 'done', finalProjectPlan: planData }));

    } catch (err: any) {
      console.error(err);
      setError(err.message || 'An unexpected error occurred during finalization.');
      setProjectState(prevState => ({ ...prevState, stage: 'reviewing' }));
    }
  };
  
  const handleSaveProject = async () => {
    if (!projectState.sourceImageUrl) {
      setError("No project to save.");
      return;
    }
    const isFavorite = window.confirm("Mark this project as a favorite?\n\nFavorited projects are never deleted automatically. Non-favorites are removed after 20 days.");
    setIsSaving(true); setError(null);
    try {
      const thumbnail = await compressImage(projectState.sourceImageUrl, 400);
      const compressedSourceUrl = await compressImage(projectState.sourceImageUrl);
      const compressedGeneratedUrls = await Promise.all(
        projectState.generatedImageUrls.map(url => compressImage(url))
      );
      const compressedSelectedUrl = projectState.selectedImageUrl ? await compressImage(projectState.selectedImageUrl) : null;

      const stateToSave: ProjectState = {
        ...projectState,
        sourceImageUrl: compressedSourceUrl,
        generatedImageUrls: compressedGeneratedUrls,
        selectedImageUrl: compressedSelectedUrl,
      };

      const newProject: SavedProject = {
        id: `proj_${Date.now()}`,
        savedAt: Date.now(),
        isFavorite,
        projectState: stateToSave,
        thumbnail: thumbnail,
      };
      
      const updatedProjects = [...savedProjects, newProject];
      localStorage.setItem('designBuddyProjects', JSON.stringify(updatedProjects));
      setSavedProjects(updatedProjects);
      alert("Project Saved!");

    } catch (err: any)
     {
      console.error("Failed to save project:", err);
      setError("An error occurred while saving. The project might be too large for browser storage.");
    } finally {
      setIsSaving(false);
    }
  };
  
  const handleLoadProject = (id: string) => {
    const projectToLoad = savedProjects.find(p => p.id === id);
    if (projectToLoad) {
      resetState(projectToLoad.projectState);
      setSourceImageFile(null); // Loading from data URL, not a file
      setError(null);
    } else {
      setError("Could not find the project to load.");
    }
  };

  const handleDeleteProject = (id: string) => {
    if (window.confirm("Are you sure you want to delete this project? This cannot be undone.")) {
      const updatedProjects = savedProjects.filter(p => p.id !== id);
      setSavedProjects(updatedProjects);
      localStorage.setItem('designBuddyProjects', JSON.stringify(updatedProjects));
    }
  };
  
  const handleClearAllProjects = () => {
    if (window.confirm("Are you sure you want to delete ALL saved projects? This cannot be undone.")) {
      localStorage.removeItem('designBuddyProjects');
      setSavedProjects([]);
      alert("All saved projects cleared.");
    }
  };
  
  const handleStartOver = () => {
    resetState(initialState);
    setSourceImageFile(null);
    setError(null);
  }

  const handleExportToPdf = async () => {
    if (!projectState.finalProjectPlan || !projectState.selectedImageUrl) {
      setError("Cannot export: No final plan or image available.");
      return;
    }
    setIsExporting(true);
    setError(null);

    try {
      const { jsPDF } = jspdf;
      const pdf = new jsPDF({
        orientation: 'p', unit: 'px', format: 'a4',
        putOnlyUsedFonts: true, floatPrecision: 16
      });

      // Page 1: Title and Image
      pdf.setFontSize(24);
      pdf.text("Design Buddy: Project Plan", pdf.internal.pageSize.getWidth() / 2, 40, { align: 'center' });
      
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.src = projectState.selectedImageUrl;
      await new Promise(resolve => { img.onload = resolve; });

      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const margin = 40;
      const availableWidth = pageWidth - (margin * 2);
      const availableHeight = pageHeight - 80;
      let imgWidth = img.width;
      let imgHeight = img.height;
      const ratio = imgWidth / imgHeight;

      if (imgWidth > availableWidth) {
        imgWidth = availableWidth;
        imgHeight = imgWidth / ratio;
      }
      if (imgHeight > availableHeight) {
        imgHeight = availableHeight;
        imgWidth = imgHeight * ratio;
      }
      
      const x = (pageWidth - imgWidth) / 2;
      pdf.addImage(projectState.selectedImageUrl, 'JPEG', x, 70, imgWidth, imgHeight);

      // Page 2: Project Details
      pdf.addPage();
      
      const planElement = document.querySelector('.final-plan-details');
      if (!planElement) throw new Error("Could not find plan element to export.");
      
      const canvas = await html2canvas(planElement as HTMLElement, {
        scale: 2, useCORS: true, backgroundColor: '#ffffff'
      });

      const canvasImgData = canvas.toDataURL('image/jpeg', 1.0);
      const canvasRatio = canvas.width / canvas.height;
      let pdfCanvasWidth = pageWidth - (margin * 2);
      let pdfCanvasHeight = pdfCanvasWidth / canvasRatio;

      if (pdfCanvasHeight > pageHeight - (margin * 2)) {
        pdfCanvasHeight = pageHeight - (margin * 2);
        pdfCanvasWidth = pdfCanvasHeight * canvasRatio;
      }

      const canvasX = (pageWidth - pdfCanvasWidth) / 2;
      pdf.addImage(canvasImgData, 'JPEG', canvasX, margin, pdfCanvasWidth, pdfCanvasHeight);
      pdf.save('Design-Buddy-Project-Plan.pdf');

    } catch (err: any) {
      console.error("PDF Export failed:", err);
      setError("Sorry, there was an error creating the PDF.");
    } finally {
      setIsExporting(false);
    }
  };

  const isLoading = ['analyzing', 'supervising', 'designing', 'reworking', 'finalizing'].includes(projectState.stage);

  return (
    <div className="app-container">
      <header>
        <div className="header-actions-left">
          <button onClick={undo} disabled={!canUndo || isLoading} className="header-button">Undo</button>
          <button onClick={redo} disabled={!canRedo || isLoading} className="header-button">Redo</button>
        </div>
        <div className="header-title">
          <h1>Design Buddy</h1>
          <p>Your AI Interior Design Studio</p>
        </div>
        <div className="header-actions-right">
          <button onClick={handleSaveProject} disabled={!projectState.sourceImageUrl || isLoading || isSaving} className="header-button">
            {isSaving ? 'Saving...' : 'Save Project'}
          </button>
          <button onClick={handleStartOver} className="header-button">New Project</button>
        </div>
      </header>
      <main>
        <div className="card">
          <h2>Control Panel</h2>
          <div className="controls">
             {projectState.stage === 'upload' && (
              <div className="upload-options">
                <div className="file-input-wrapper">
                  <label htmlFor="file-upload" className="file-input-label">
                    Upload Room Image to Begin
                  </label>
                  <input id="file-upload" type="file" accept="image/*" onChange={handleFileChange} disabled={isLoading} />
                </div>
                
                {savedProjects.length > 0 && (
                  <div className="saved-projects-container">
                    <h3>Load a Project</h3>
                    <div className="saved-projects-list">
                      {savedProjects.sort((a,b) => b.savedAt - a.savedAt).map(proj => (
                        <div key={proj.id} className="saved-project-item">
                          <img src={proj.thumbnail} alt="Project thumbnail" className="saved-project-thumbnail" onClick={() => handleLoadProject(proj.id)} />
                          <div className="saved-project-info">
                            <p className="saved-project-date">
                              {proj.isFavorite && <span className="favorite-star" title="Favorite">★</span>}
                              Saved: {new Date(proj.savedAt).toLocaleDateString()}
                            </p>
                            <div className="saved-project-actions">
                              <button onClick={() => handleLoadProject(proj.id)}>Load</button>
                              <button onClick={() => handleDeleteProject(proj.id)} className="delete-btn">Delete</button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                    <button onClick={handleClearAllProjects} className="clear-save-button">Clear All Projects</button>
                  </div>
                )}
              </div>
            )}
            
            {projectState.sourceImageUrl && projectState.stage !== 'upload' && (
              <>
                <h3>Your Space</h3>
                <img src={projectState.sourceImageUrl} alt="Your uploaded room" className="image-preview" />
              </>
            )}

            {isLoading && <Narrator stage={projectState.stage} />}
            
            {projectState.analysis && !isLoading && (
              <div className="analysis-wrapper">
                <h3>AI Analysis Report</h3>
                <div className="analysis-grid">
                  <div><h4>Style</h4><p>{projectState.analysis.styleAnalysis}</p></div>
                  <div><h4>Opportunities</h4><p>{projectState.analysis.opportunities}</p></div>
                  <div className="analysis-full-width">
                    <h4>Color Palette</h4>
                    <div className="color-palette">
                      {projectState.analysis.colorPalette.map(color => (
                        <div key={color.hex} className="color-swatch-container">
                          <div className="color-swatch" style={{ backgroundColor: color.hex }} title={`${color.name} - ${color.hex}`}></div>
                          <span>{color.name}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="analysis-full-width">
                    <h4>Key Objects</h4>
                    <ul className="key-objects-list">
                      {projectState.analysis.keyObjects.map((obj, i) => <li key={i}><strong>{obj.name}:</strong> {obj.description}</li>)}
                    </ul>
                  </div>
                </div>
              </div>
            )}

            {projectState.enhancedPrompt && !isLoading && (
              <div className="enhanced-prompt-wrapper">
                  <h3>Your Enhanced Brief</h3>
                  <blockquote className="enhanced-prompt-content">{projectState.enhancedPrompt}</blockquote>
              </div>
            )}

            {projectState.reworkDiagnosis && (
               <div className="diagnosis-wrapper">
                  <h3>Art Director's Diagnosis</h3>
                  <div className="diagnosis-content">{projectState.reworkDiagnosis}</div>
               </div>
            )}

            {projectState.stage === 'suggestions_ready' && (
              <>
                <h3>AI Curator's Ideas</h3>
                <div className="suggestions-grid">
                  {projectState.suggestions.map((s, i) => (
                    <button key={i} className="suggestion-button" onClick={() => handleDesignRequest(s)} disabled={isLoading}>
                      {s}
                    </button>
                  ))}
                </div>
                <h3>Direct the Designer</h3>
                <textarea value={projectState.prompt} onChange={(e) => setProjectState(prevState => ({ ...prevState, prompt: e.target.value }), true)} placeholder="e.g., 'Make it a cozy reading nook...'" rows={3} disabled={isLoading} aria-label="Design prompt" />
                <button className="design-button" onClick={() => handleDesignRequest(projectState.prompt)} disabled={isLoading || !projectState.prompt.trim()} aria-label="Generate new design">
                  ✨ Design with My Prompt!
                </button>
              </>
            )}
            
            {projectState.stage === 'reviewing' && (
              <div className="review-controls">
                <h3>Review & Refine</h3>
                <p>Select your favorite design below, then finalize the project or request a rework.</p>
                <button className="finalize-button" onClick={handleFinalizeRequest} disabled={isLoading || !projectState.selectedImageUrl}>
                  ✅ Finalize Project!
                </button>
                <div className="rework-form">
                  <textarea value={projectState.reworkFeedback} onChange={(e) => setProjectState(prevState => ({ ...prevState, reworkFeedback: e.target.value }), true)} placeholder="Provide feedback for the Art Director..." rows={3} disabled={isLoading} aria-label="Rework feedback" />
                  <button className="rework-button" onClick={handleReworkRequest} disabled={isLoading || !projectState.reworkFeedback.trim()}>
                    Request Rework
                  </button>
                </div>
              </div>
            )}
             
            {(projectState.stage === 'done') && (
              <div className="done-actions">
                <button className="design-button" onClick={handleStartOver}>
                  Start a New Project
                </button>
                <button 
                  className="export-button" 
                  onClick={handleExportToPdf} 
                  disabled={isExporting}
                >
                  {isExporting ? 'Exporting...' : 'Export as PDF'}
                </button>
              </div>
            )}
            
            {error && <p className="error-message">{error}</p>}
          </div>
        </div>
        <div className="card">
          <h2>Creative Director's Console</h2>
            {(projectState.stage !== 'reviewing' && projectState.stage !== 'done') && (
               <div className="output-placeholder">
                <p>Your new designs will appear here...</p>
              </div>
            )}

            {projectState.generatedImageUrls.length > 0 && projectState.stage === 'reviewing' && (
              <div className="generated-image-grid">
                {projectState.generatedImageUrls.map((url, index) => (
                  <img key={index} src={url} alt={`AI generated design ${index + 1}`} className={`generated-image-item ${projectState.selectedImageUrl === url ? 'selected' : ''}`} onClick={() => setProjectState(prevState => ({ ...prevState, selectedImageUrl: url }), true)} />
                ))}
              </div>
            )}

            {projectState.finalProjectPlan && projectState.stage === 'done' && (
              <div className="final-plan-wrapper">
                <h3>Your Action Plan</h3>
                <div className="final-plan-layout">
                  <div className="final-plan-image-container">
                    <img src={projectState.selectedImageUrl!} alt="Final selected design" className="final-plan-image" />
                  </div>
                  <div className="final-plan-details">
                    <h4>Your AI Design Team</h4>
                    <div className="team-avatars">
                      <div className="avatar" title="Analyst">A</div>
                      <div className="avatar" title="Curator">C</div>
                      <div className="avatar" title="Supervisor">S</div>
                      <div className="avatar" title="Designer">D</div>
                      <div className="avatar" title="Project Manager">PM</div>
                    </div>

                    <h4>Project Summary</h4><p>{projectState.finalProjectPlan.summary}</p>
                    <h4>Estimated Budget</h4><p>{projectState.finalProjectPlan.budget}</p>
                    <h4>Shopping List</h4>
                    <table className="plan-table">
                      <thead><tr><th>Item</th><th>Description</th><th>Est. Cost</th></tr></thead>
                      <tbody>
                        {projectState.finalProjectPlan.shoppingList.map((item, index) => (
                          <tr key={index}><td>{item.item}</td><td>{item.description}</td><td>{item.cost}</td></tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}
        </div>
      </main>
    </div>
  );
};

const root = createRoot(document.getElementById('root')!);
root.render(<App />);