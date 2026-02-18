import React from 'react';
import { ArrowLeft, Monitor, Smartphone, Edit3, Wifi } from 'lucide-react';

interface HelpProps {
  onBack: () => void;
}

export const Help: React.FC<HelpProps> = ({ onBack }) => {
  return (
    <div className="min-h-screen bg-black text-white p-6 overflow-y-auto">
      <div className="max-w-4xl mx-auto">
        <button onClick={onBack} className="flex items-center text-blue-300 hover:text-white mb-8 transition-colors">
          <ArrowLeft className="mr-2" /> Back to Home
        </button>

        <h1 className="text-5xl font-display text-jeopardy-gold mb-6">How to Host a Flawless Game</h1>
        <p className="text-xl text-gray-300 mb-12 leading-relaxed">
          BuzzWord is a professional-grade DIY trivia platform. Follow this guide to ensure your game night runs smoothly.
        </p>

        <div className="space-y-12">
          {/* Section 1: Creating */}
          <section className="bg-gray-900 p-8 rounded-2xl border border-gray-800">
            <div className="flex items-center mb-6">
              <div className="p-3 bg-blue-900 rounded-lg mr-4">
                <Edit3 className="w-6 h-6 text-white" />
              </div>
              <h2 className="text-3xl font-bold">1. Creating Your Board</h2>
            </div>
            <ul className="space-y-4 text-gray-300 list-disc pl-6">
              <li><strong>Adding Categories:</strong> Use the "Add Category" button to expand your board horizontally. Standard games have 5 or 6 categories.</li>
              <li><strong>Adding Rows:</strong> Use "Add Row" to make the game longer. Points increase automatically by 200 for each new row.</li>
              <li><strong>Adding Images:</strong> Click any cell to edit it. To add an image, simply <strong>copy an image</strong> from the web or your computer and press <strong>Ctrl+V (Cmd+V)</strong> while the editor modal is open. The image will appear in the preview box.</li>
              <li><strong>Saving:</strong> Games are saved to your browser's local storage. Do not clear your browser cache if you want to keep them!</li>
            </ul>
          </section>

          {/* Section 2: Setup */}
          <section className="bg-gray-900 p-8 rounded-2xl border border-gray-800">
             <div className="flex items-center mb-6">
              <div className="p-3 bg-indigo-900 rounded-lg mr-4">
                <Wifi className="w-6 h-6 text-white" />
              </div>
              <h2 className="text-3xl font-bold">2. Connection & Display</h2>
            </div>
            <div className="bg-green-900/30 border border-green-700 p-4 rounded-lg mb-6">
              <p className="font-bold text-green-500">ONLINE READY</p>
              <p className="text-sm text-green-200 mt-2">
                This app uses peer-to-peer technology. You can host a game on your laptop and have friends join from their phones anywhere in the world!
              </p>
            </div>
            <ul className="space-y-4 text-gray-300 list-disc pl-6">
              <li><strong>The Setup:</strong> Connect your laptop to a big screen TV via HDMI. This screen will show the <strong>Host Game</strong> view.</li>
              <li><strong>The Lobby:</strong> Once you click "Host", you will see a 4-letter Lobby Code (e.g., ABCD). Wait for the "ONLINE" indicator to appear in the top right.</li>
              <li><strong>Players:</strong> Have your friends go to the same website on their phones, click "Join Lobby", and enter the code. They will appear on your screen once connected.</li>
            </ul>
          </section>

          {/* Section 3: Gameplay */}
          <section className="bg-gray-900 p-8 rounded-2xl border border-gray-800">
             <div className="flex items-center mb-6">
              <div className="p-3 bg-green-900 rounded-lg mr-4">
                <Monitor className="w-6 h-6 text-white" />
              </div>
              <h2 className="text-3xl font-bold">3. Running the Show</h2>
            </div>
            <ul className="space-y-4 text-gray-300 list-disc pl-6">
              <li><strong>The Flow:</strong>
                <ol className="list-decimal pl-6 mt-2 space-y-2">
                   <li>Click a dollar amount on the board to open the question.</li>
                   <li>Read the question aloud.</li>
                   <li>Click <strong>"OPEN"</strong> (or press Spacebar) to unlock buzzers. The players' buttons will turn yellow.</li>
                   <li>The first player to buzz in locks everyone else out. Their name flashes on your screen.</li>
                   <li>If they are correct, click <strong>Correct</strong>. Points are awarded, and the answer is revealed.</li>
                   <li>If they are wrong, click <strong>Wrong</strong>. Points are deducted, and buzzers re-open for others.</li>
                </ol>
              </li>
              <li><strong>Revealing:</strong> If no one answers, click "Reveal" to show the answer, then "Back to Board".</li>
            </ul>
          </section>
        </div>
        
        <div className="mt-12 text-center text-gray-500">
           Ready? Go back and start your game!
        </div>
      </div>
    </div>
  );
};
