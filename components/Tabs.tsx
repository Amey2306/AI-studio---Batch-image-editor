import React from 'react';

interface TabsProps {
  tabs: string[];
  activeTab: string;
  setActiveTab: (tab: string) => void;
}

const Tabs: React.FC<TabsProps> = ({ tabs, activeTab, setActiveTab }) => {
  return (
    <div className="flex justify-center border-b border-slate-700 mb-6">
      {tabs.map((tab) => (
        <button
          key={tab}
          onClick={() => setActiveTab(tab)}
          className={`px-4 sm:px-6 py-3 text-sm sm:text-base font-medium transition-colors duration-200 ease-in-out focus:outline-none ${
            activeTab === tab
              ? 'border-b-2 border-sky-500 text-sky-400'
              : 'text-slate-400 hover:text-sky-400'
          }`}
        >
          {tab}
        </button>
      ))}
    </div>
  );
};

export default Tabs;
