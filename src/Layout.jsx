import React from "react";

export default function Layout({ children, currentPageName }) {
  // Overlay pages should have no layout - transparent background for OBS
  const isOverlay = currentPageName === "BracketOverlay" || currentPageName === "CountdownOverlay";
  
  if (isOverlay) {
    return (
      <div className="min-h-screen">
        {children}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950">
      {children}
    </div>
  );
}