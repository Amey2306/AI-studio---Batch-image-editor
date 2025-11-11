import React, { useState } from 'react';
import Header from './components/Header';
import Tabs from './components/Tabs';
import ImageGenerator from './components/ImageGenerator';
import ImageEditor from './components/ImageEditor';

type Tab = 'Generate' | 'Edit';

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<Tab>('Generate');

  const renderContent = () => {
    switch (activeTab) {
      case 'Generate':
        return <ImageGenerator />;
      case 'Edit':
        return <ImageEditor />;
      default:
        return null;
    }
  };

  return (
    <div className="bg-slate-900 min-h-screen text-slate-100 font-sans">
      <div className="container mx-auto px-4 py-8 max-w-5xl">
        <Header />
        <main>
          <Tabs
            tabs={['Generate', 'Edit']}
            activeTab={activeTab}
            setActiveTab={setActiveTab as (tab: string) => void}
          />
          <div className="mt-6 bg-slate-800 p-6 sm:p-8 rounded-xl shadow-2xl border border-slate-700 min-h-[60vh]">
            {renderContent()}
          </div>
        </main>
        <footer className="text-center py-6 text-slate-500 text-sm">
          <p>Powered by Google Gemini</p>
        </footer>
      </div>
    </div>
  );
};

export default App;