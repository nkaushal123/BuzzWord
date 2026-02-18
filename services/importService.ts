import { GameBoard, Category, Question } from '../types';

const generateId = () => Math.random().toString(36).substr(2, 9);

// --- HELPER: Parse from JSON Data (Most Reliable) ---
const parseFromJSON = (json: any, defaultTitle: string): GameBoard => {
    // JeopardyLabs JSON usually has 'groups' which are categories
    // Or sometimes it's a flat array. We handle the standard format.
    
    // Check if it's the standard object structure
    const rawCategories = json.groups || json.categories || [];
    
    if (!Array.isArray(rawCategories)) {
        throw new Error("Invalid JSON structure found.");
    }

    const categories: Category[] = rawCategories.map((group: any, index: number) => ({
        id: generateId(),
        title: group.name || `Category ${index + 1}`,
        questions: (group.reads || group.questions || []).map((q: any, qIndex: number) => ({
            id: generateId(),
            points: (q.value || (qIndex + 1) * 100) * 2, // Normalize 100->200
            question: q.clue || q.question || '',
            answer: q.answer || q.correct_response || '',
            image: q.image || undefined
        }))
    }));

    return {
        id: generateId(),
        title: json.title || defaultTitle,
        createdAt: Date.now(),
        categories
    };
};

// --- HELPER: Parse from DOM (Fallback) ---
const parseFromDOM = (doc: Document, title: string): GameBoard => {
    const categories: Category[] = [];
    
    // 1. Identify Categories
    // Strategy A: .cat-cell (Play Mode / User File)
    // Strategy B: .category-name (Edit Mode)
    // Strategy C: th (Table export)
    let headerEls = Array.from(doc.querySelectorAll('.cat-cell'));
    if (headerEls.length === 0) headerEls = Array.from(doc.querySelectorAll('.category-name'));
    if (headerEls.length === 0) headerEls = Array.from(doc.querySelectorAll('th'));

    if (headerEls.length === 0) {
         // If still nothing, check if there is a grid-row-cats
         const catRow = doc.querySelector('.grid-row-cats');
         if (catRow) {
             headerEls = Array.from(catRow.querySelectorAll('.cell-inner'));
         }
    }

    if (headerEls.length === 0) {
        throw new Error("Could not find categories in HTML. Ensure this is a valid JeopardyLabs file.");
    }

    headerEls.forEach(header => {
        // Filter out empty headers if using 'th' selector which catches random things sometimes
        const text = header.textContent?.trim();
        if (text) {
            categories.push({ id: generateId(), title: text, questions: [] });
        }
    });

    // 2. Identify Rows
    // Strategy A: .grid-row-questions (Play Mode / User File)
    // Strategy B: .grid-row (Edit Mode)
    // Strategy C: tr (Table export)
    let rowEls = Array.from(doc.querySelectorAll('.grid-row-questions'));
    if (rowEls.length === 0) {
        // Fallback to generic grid-row, but exclude the header row if it shares class
        rowEls = Array.from(doc.querySelectorAll('.grid-row')).filter(r => !r.classList.contains('grid-row-cats'));
    }
    if (rowEls.length === 0) {
         rowEls = Array.from(doc.querySelectorAll('tr')).filter(tr => !tr.querySelector('th'));
    }

    rowEls.forEach((row, rIndex) => {
        // Find cells in this row
        let cellEls = Array.from(row.querySelectorAll('.grid-cell')); // Play Mode
        if (cellEls.length === 0) cellEls = Array.from(row.querySelectorAll('.clue_cell')); // Edit Mode
        if (cellEls.length === 0) cellEls = Array.from(row.querySelectorAll('td')); // Table Mode

        cellEls.forEach((cell, cIndex) => {
            if (cIndex >= categories.length) return;

            // -- Extract Points --
            let points = (rIndex + 1) * 200; // Default calculation
            const pointEl = cell.querySelector('.cell-inner') || cell.querySelector('.point_value');
            if (pointEl) {
                const pVal = parseInt(pointEl.textContent?.trim() || '0', 10);
                if (!isNaN(pVal) && pVal > 0) points = pVal;
            }

            // -- Extract Clue (Question) & Answer (Response) --
            // NOTE: In JeopardyLabs "Play Mode":
            // .front.answer = The Clue (Visible) -> App 'question'
            // .back.question = The Solution (Hidden) -> App 'answer'
            //
            // NOTE: In JeopardyLabs "Edit Mode":
            // .clue_text = The Clue -> App 'question'
            // .correct_response = The Solution -> App 'answer'

            let clueEl = cell.querySelector('.front.answer');
            if (!clueEl) clueEl = cell.querySelector('.clue_text');
            
            let responseEl = cell.querySelector('.back.question');
            if (!responseEl) responseEl = cell.querySelector('.correct_response');

            // -- Extract Content --
            let qText = clueEl?.textContent?.trim() || '';
            let aText = responseEl?.textContent?.trim() || '';

            // Handle images (often in the clue element)
            let image = undefined;
            const imgTag = clueEl?.querySelector('img');
            if (imgTag) {
                image = imgTag.getAttribute('src') || undefined;
            }

            // If we are parsing a plain table, the whole cell might be the text
            if (!clueEl && !responseEl && cellEls.length === categories.length) {
                qText = cell.textContent?.trim() || '';
                aText = 'Reveal on Screen';
            }

            // Fallback for empty slots
            if (!qText) qText = '-';
            if (!aText) aText = '-';

            categories[cIndex].questions.push({
                id: generateId(),
                points,
                question: qText,
                answer: aText,
                image
            });
        });
    });

    return {
        id: generateId(),
        title,
        createdAt: Date.now(),
        categories
    };
};


// --- MAIN PARSER ---
export const parseJeopardyHTML = (htmlContent: string): GameBoard => {
  const parser = new DOMParser();
  const doc = parser.parseFromString(htmlContent, 'text/html');

  // 1. Extract Title
  const title = doc.querySelector('h1.title')?.textContent?.trim() || doc.title || 'Imported Game';

  // 2. STRATEGY 1: JSON Extraction (Best)
  const scripts = Array.from(doc.querySelectorAll('script'));
  for (const script of scripts) {
      const content = script.textContent || '';
      const match = content.match(/(?:var|const|let|window\.)\s*board\s*=\s*(\{.*?\});/s);
      
      if (match && match[1]) {
          try {
              const json = JSON.parse(match[1]);
              return parseFromJSON(json, title);
          } catch (e) {
              console.warn("Found board JSON but failed to parse:", e);
          }
      }
  }

  // 3. STRATEGY 2: DOM Parsing (Robust)
  try {
      return parseFromDOM(doc, title);
  } catch (e) {
      console.warn("DOM parsing failed:", e);
      throw new Error("Could not parse file structure. Supported formats: JeopardyLabs 'Play' HTML, 'Edit' HTML, or JSON exports.");
  }
};

// --- FILE IMPORT ---
export const importFromHTMLFile = async (file: File): Promise<GameBoard> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const content = e.target?.result as string;
            try {
                const board = parseJeopardyHTML(content);
                resolve(board);
            } catch (err: any) {
                reject(new Error(err.message || "Failed to parse file"));
            }
        };
        reader.onerror = () => reject(new Error("Failed to read the file."));
        reader.readAsText(file);
    });
};

// --- URL IMPORT ---
async function fetchWithProxy(url: string): Promise<string> {
  const encodedUrl = encodeURIComponent(url);
  try {
    const response = await fetch(`https://api.allorigins.win/get?url=${encodedUrl}&t=${Date.now()}`);
    if (response.ok) {
      const data = await response.json();
      if (data.contents) return data.contents;
    }
  } catch (e) { console.warn("Proxy 1 failed"); }

  try {
    const response = await fetch(`https://corsproxy.io/?${encodedUrl}`);
    if (response.ok) {
      const text = await response.text();
      if (text) return text;
    }
  } catch (e) { console.warn("Proxy 2 failed"); }

  throw new Error("Could not download. Please download the HTML file from JeopardyLabs and use 'Upload HTML File'.");
}

export const importFromJeopardyLabs = async (url: string): Promise<GameBoard> => {
  let targetUrl = url.trim();
  if (!targetUrl.includes('jeopardylabs.com')) {
    throw new Error('Invalid URL. Please use a link from jeopardylabs.com');
  }
  if (!targetUrl.startsWith('http')) targetUrl = `https://${targetUrl}`;

  const htmlContent = await fetchWithProxy(targetUrl);
  return parseJeopardyHTML(htmlContent);
};