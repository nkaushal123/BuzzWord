import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

interface WindowPortalProps {
  children: React.ReactNode;
  closeWindowPortal: () => void;
  title?: string;
}

export const WindowPortal: React.FC<WindowPortalProps> = ({ children, closeWindowPortal, title = 'BuzzWord TV' }) => {
  const [container, setContainer] = useState<HTMLElement | null>(null);
  const externalWindow = useRef<Window | null>(null);

  useEffect(() => {
    // 1. Open a new browser window
    const newWindow = window.open('', '', 'width=1280,height=720,left=200,top=200');
    externalWindow.current = newWindow;

    if (!newWindow) {
        alert("Pop-up blocked! Please allow pop-ups for this site to use TV Mode.");
        closeWindowPortal();
        return;
    }

    // 2. Set Title
    newWindow.document.title = title;

    // 3. Copy Styles (Tailwind CDN + Custom Styles)
    // We manually recreate the head content to ensure it loads in the new window
    const headHtml = document.head.innerHTML;
    newWindow.document.head.innerHTML = headHtml;
    
    // Explicitly re-add the Tailwind script if it didn't copy over cleanly (sometimes script tags don't execute when copied via innerHTML)
    // But since we are using CDN in index.html, we need to make sure the new window parses it.
    // A safer bet is to create a div in the body and render into it.
    
    // 4. Create container
    const el = newWindow.document.createElement('div');
    el.setAttribute('id', 'portal-root');
    // Add base classes for full height
    el.className = "h-screen w-screen bg-black";
    newWindow.document.body.appendChild(el);
    newWindow.document.body.className = "bg-black"; // Ensure body is black

    setContainer(el);

    // 5. Handle Close
    newWindow.addEventListener('beforeunload', () => {
      closeWindowPortal();
    });

    return () => {
      newWindow.close();
    };
  }, []); // Empty dependency array = run once on mount

  // 6. Render children into the new window via Portal
  return container ? createPortal(children, container) : null;
};