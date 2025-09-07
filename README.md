
# Design Buddy: Your AI Interior Design Studio

## 1. Overview

Design Buddy is an interactive web application that acts as a personal AI-powered interior design assistant. It allows users to upload an image of their room and leverages the Google Gemini API to analyze the space, suggest new design concepts, generate visual redesigns, and create an actionable project plan. The entire user experience is guided by a "team" of specialized AI personas, each handling a specific step in the creative process.

---

## 2. Key Features

*   **Image Upload:** Users can upload a photo of any room to begin the design process.
*   **AI-Powered Space Analysis:** The application provides a detailed analysis of the uploaded room's existing style, color palette, key objects, and potential areas for improvement.
*   **Curated Design Suggestions:** Based on the analysis, the AI generates three distinct design directions: two logical evolutions and one "Creative Wildcard" to inspire bold changes.
*   **User-Directed Design:** Users can either select a curated suggestion or write their own custom prompt to guide the AI designer.
*   **Visual Generation:** The app generates three unique, high-quality image variations of the redesigned space, preserving the room's original architectural structure (walls, windows, doors).
*   **Iterative Rework Cycle:** If the initial designs aren't perfect, users can provide feedback. An "AI Art Director" offers a diagnosis and suggests how to refine the prompt for better results.
*   **Actionable Project Plan:** Once a final design is selected, the application generates a complete project plan, including a project summary, an estimated budget range, and a detailed shopping list with item descriptions and estimated costs.

---

## 3. The AI Design Team (Personas & Prompts)

Design Buddy simulates a creative studio by using different AI personas, each with a specialized role defined by a system prompt.

1.  **AI Analyst:**
    *   **Role:** Analyzes the initial user-uploaded image.
    *   **Task:** Provides a professional assessment covering style, color, materials, and opportunities.
    *   **Model:** `gemini-2.5-flash-image-preview`

2.  **AI Curator:**
    *   **Role:** Ideates design directions based on the Analyst's report.
    *   **Task:** Generates three concise design suggestions in a structured JSON format.
    *   **Model:** `gemini-2.5-flash`

3.  **AI Supervisor:**
    *   **Role:** Acts as a creative director.
    *   **Task:** Enhances the user's chosen prompt into a more detailed and evocative brief for the visual AI.
    *   **Model:** `gemini-2.5-flash`

4.  **AI Designer:**
    *   **Role:** Creates the visual redesigns.
    *   **Task:** Generates new images based on the original photo and the Supervisor's enhanced brief, respecting a "Structural Integrity Constraint."
    *   **Model:** `gemini-2.5-flash-image-preview`

5.  **AI Art Director:**
    *   **Role:** Manages the rework process.
    *   **Task:** Analyzes user feedback on generated designs and provides a "Design Diagnosis" and a "Recommended Next Step."
    *   **Model:** `gemini-2.5-flash`

6.  **AI Project Manager:**
    *   **Role:** Finalizes the project.
    *   **Task:** First, uses the vision model to describe the final selected image in detail. Then, uses that description to generate a structured JSON project plan (summary, budget, shopping list).
    *   **Models:** `gemini-2.5-flash-image-preview` (for analysis), `gemini-2.5-flash` (for JSON generation).

---

## 4. Tech Stack

*   **Frontend Framework:** React 19 (using `createRoot`)
*   **Language:** TypeScript
*   **AI Models:** Google Gemini API (`@google/genai`)
*   **Styling:** CSS3 (Flexbox, Grid)
*   **Bundling/Imports:** ES Modules via import maps (no build step needed).

---

## 5. Application Flow & Logic (`index.tsx`)

The application is a single-page app contained within `index.tsx`. Its state and UI are primarily managed by the `stage` state variable.

### State Management

The core logic is driven by the `stage` state (`useState<Stage>('upload')`), which can be one of the following:

*   `upload`: Initial state, waiting for file input.
*   `analyzing`: After upload, while the Analyst and Curator are working.
*   `suggestions_ready`: Analysis is complete, and the user can choose a suggestion or write a prompt.
*   `supervising`: The Supervisor is enhancing the user's prompt.
*   `designing`: The Designer is generating images.
*   `reviewing`: The three designs are displayed for user selection or rework feedback.
*   `reworking`: The Art Director is processing feedback.
*   `finalizing`: The Project Manager is creating the action plan.
*   `done`: The final project plan is displayed.

### Key Functions

*   `handleFileChange`: Kicks off the process by triggering `runAnalysisAndSuggestions`.
*   `runAnalysisAndSuggestions`: Calls the AI Analyst and Curator to get the initial analysis and design ideas.
*   `handleDesignRequest`: Calls the AI Supervisor and Designer to generate the three visual options.
*   `handleReworkRequest`: Engages the AI Art Director to get feedback on how to improve the prompt and returns the user to the `suggestions_ready` stage.
*   `handleFinalizeRequest`: A two-step process that uses the vision model to analyze the final image and then the text model to generate the structured JSON project plan.
*   `handleStartOver`: Resets all state variables to their initial values.

---

## 6. File Structure

*   `index.html`: The main entry point for the application. It includes the import map for dependencies and the root element for React.
*   `index.tsx`: The heart of the application. It contains all the React components, state management, logic, and API calls to the Gemini API.
*   `index.css`: Contains all the styling for the application, defining the layout, component appearances, and responsiveness.
*   `metadata.json`: A simple configuration file with the application's name and description.
*   `README.md`: This file.
