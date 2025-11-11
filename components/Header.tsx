import React from 'react';

const Header: React.FC = () => (
  <header className="text-center mb-8">
    <h1 className="text-4xl sm:text-5xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-sky-400 to-blue-600 mb-2">
      Gemini Image Studio
    </h1>
    <p className="text-slate-400 max-w-2xl mx-auto">
      Create, understand, and refine visuals with state-of-the-art AI. Switch between generating new images, analyzing existing ones, or editing them with simple text prompts.
    </p>
  </header>
);

export default Header;
