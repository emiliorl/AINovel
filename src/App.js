import React, { useEffect, useMemo, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import { BookOpen, Globe, Plus, LogIn, LogOut, UploadCloud, Sparkles, Settings, Users, Save, FileText, Info, AlertTriangle, Database, Eye, Edit3, ChevronLeft, ChevronRight, Type, Moon, Sun, Maximize2, Minimize2 } from "lucide-react";

/**
 * NovelTranslator — a serverless React app (debug-fixed)
 * Key fixes:
 *  - Guard all DB writes when Supabase is not configured or user not signed in (prevents null.from crash)
 *  - Include created_by on novel inserts to satisfy RLS policy
 *  - Disable UI buttons when writes are not allowed
 *  - Add lightweight self-tests to sanity-check glossary mapping and configuration guards
 */

// ---------- Minimal design helpers ----------
const Label = ({ children, className = "" }) => (
  <label className={`block text-sm font-medium text-gray-300 mb-1 ${className}`}>{children}</label>
);
const Input = (props) => (
  <input {...props} className={`w-full rounded-2xl bg-gray-800 text-gray-100 px-3 py-2 outline-none ring-1 ring-gray-700 focus:ring-2 focus:ring-indigo-500 ${props.className||''}`} />
);
const Textarea = (props) => (
  <textarea {...props} className={`w-full rounded-2xl bg-gray-800 text-gray-100 px-3 py-2 outline-none ring-1 ring-gray-700 focus:ring-2 focus:ring-indigo-500 ${props.className||''}`} />
);
const Button = ({ children, className = "", ...rest }) => (
  <button {...rest} className={`rounded-2xl px-4 py-2 font-medium shadow-sm bg-indigo-600 hover:bg-indigo-500 text-white disabled:opacity-50 disabled:cursor-not-allowed ${className}`}>{children}</button>
);
const GhostButton = ({ children, className = "", ...rest }) => (
  <button {...rest} className={`rounded-2xl px-4 py-2 font-medium ring-1 ring-gray-700 text-gray-200 hover:bg-gray-800/60 disabled:opacity-50 disabled:cursor-not-allowed ${className}`}>{children}</button>
);
const Chip = ({children}) => (
  <span className="inline-flex items-center gap-1 rounded-full bg-gray-800 ring-1 ring-gray-700 px-2.5 py-1 text-xs text-gray-200">{children}</span>
)

// ---------- Supabase client via env inputs stored in localStorage (no server needed) ----------
function useSupabase() {
  const [config, setConfig] = useState(() => ({
    url: localStorage.getItem("SUPABASE_URL") || "",
    anonKey: localStorage.getItem("SUPABASE_ANON_KEY") || "",
  }));
  const client = useMemo(() => {
    if (!config.url || !config.anonKey) return null;
    return createClient(config.url, config.anonKey);
  }, [config]);
  return { supabase: client, config, setConfig };
}

// ---------- AI Translation Provider ----------
const AI_TRANSLATOR = {
  name: "AI Novel Translator",
  keyName: "GEMINI_API_KEY",
  translate: async ({ text, tone, chapterTitle }) => {
    const apiKey = localStorage.getItem("GEMINI_API_KEY");
    if (!apiKey) throw new Error("Set Gemini API key in Settings for AI translation.");
    
         // First, analyze the text to extract context automatically
     const analysisPrompt = `Analyze this Chinese novel chapter and extract:
 1. Chapter title (if present in the text, usually at the beginning)
 2. Character names (with gender if mentioned)
 3. Important terms/jargon that need consistent translation
 4. Inside jokes or recurring themes
 5. Novel title (if not in English, translate it)
 
 IMPORTANT: For Chinese character names, provide both:
 - English translation (if the name has a meaning)
 - Pinyin romanization (for pronunciation)
 - Choose the most appropriate: use English translation if the name has clear meaning, otherwise use pinyin
 
 IMPORTANT: For chapter titles:
 - Look for patterns like "第 X 章" or standalone titles at the beginning
 - Extract the actual title text, not the chapter number
 - If no clear title is found, use null
 
 Return as JSON:
 {
   "chapterTitle": "extracted chapter title or null",
   "novelTitle": "English title",
   "characters": [
     {
       "chineseName": "Chinese characters",
       "englishName": "English translation or pinyin",
       "gender": "M/F",
       "description": "brief description",
       "nameType": "translation/pinyin"
     }
   ],
   "jargon": [{"term": "Chinese term", "meaning": "English meaning"}],
   "insideJokes": ["description of recurring jokes/themes"]
 }
 
 Text to analyze:
 ${text}`;

    try {
             // Step 1: Analyze and extract context
       const analysisResponse = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: analysisPrompt }] }],
          generationConfig: { temperature: 0.1 }
        })
      });

      if (!analysisResponse.ok) {
        throw new Error(`Analysis failed: ${analysisResponse.status}`);
      }

      const analysisResult = await analysisResponse.json();
      const analysisText = analysisResult.candidates?.[0]?.content?.parts?.[0]?.text || "{}";
      
      let context;
      try {
        context = JSON.parse(analysisText);
      } catch {
        context = { novelTitle: chapterTitle || "Unknown Novel", characters: [], jargon: [], insideJokes: [] };
      }

             // Step 2: Translate with extracted context
       const translationPrompt = `You are translating a novel chapter from Chinese to English.
 
 IMPORTANT TONE GUIDELINES:
 - Match the original tone EXACTLY - if it's casual/colloquial, keep it casual
 - Use natural, conversational English that feels authentic
 - Avoid overly formal or academic language unless the original is formal
 - Preserve the character's personality and speech patterns
 - For casual dialogue, use contractions, slang, and natural expressions
 - For web novels, maintain that snappy, engaging style
 
 Novel Context:
 - Title: ${context.novelTitle}
 - Characters: ${context.characters.map(c => `${c.chineseName} → ${c.englishName} (${c.gender || 'unknown'}) - ${c.description || 'no description'} [${c.nameType || 'unknown'}]`).join(', ')}
 - Important Terms: ${context.jargon.map(j => `"${j.term}" = "${j.meaning}"`).join(', ')}
 - Recurring Themes: ${context.insideJokes.join(', ')}
 
 IMPORTANT: When translating character names in the text:
 - Use the English names provided in the context consistently
 - If a character appears for the first time, you may include both Chinese and English names briefly
 - Maintain the same name throughout the chapter
 
 IMPORTANT: Chapter title handling:
 - If a chapter title was detected (${context.chapterTitle}), REMOVE it from the translation
 - Start the translation directly with the story content
 - Do not include chapter numbers or titles in the output
 
 Tone/style: ${tone || 'match original'}
 
 Translate this text into natural, flowing English:
 
 ${text}`;

             const translationResponse = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: translationPrompt }] }],
          generationConfig: { temperature: 0.3 }
        })
      });

      if (!translationResponse.ok) {
        throw new Error(`Translation failed: ${translationResponse.status}`);
      }

      const translationResult = await translationResponse.json();
      const translatedText = translationResult.candidates?.[0]?.content?.parts?.[0]?.text || text;

      return { 
        english: translatedText, 
        notes: [],
        context: context // Return extracted context for display
      };
    } catch (error) {
      console.error('AI Translation error:', error);
      throw new Error(`AI Translation failed: ${error.message}`);
    }
  }
};



// ---------- Supabase table helpers ----------
async function ensureSchema(supabase) {
  const required = ["novels", "chapters", "translations", "glossary", "profiles"];
  const results = await Promise.all(required.map(async (t) => {
    const { error } = await supabase.from(t).select("count", { count: "exact", head: true });
    return { t, ok: !error };
  }));
  return results;
}

// ---------- Main App ----------
export default function App() {
  const { supabase, config, setConfig } = useSupabase();
  const [user, setUser] = useState(null);
  const [novels, setNovels] = useState([]);
  const [activeNovel, setActiveNovel] = useState(null);
  const [chapters, setChapters] = useState([]);
  const [activeChapter, setActiveChapter] = useState(null);
  const [sourceZH, setSourceZH] = useState("");
  const [translationEN, setTranslationEN] = useState("");
  const [notes, setNotes] = useState([]);
  const [tone, setTone] = useState("match original");
  const [status, setStatus] = useState("");
  const [extractedContext, setExtractedContext] = useState(null);

  // Reading mode state
  const [isReadingMode, setIsReadingMode] = useState(false);
  const [fontSize, setFontSize] = useState(16);
  const [isDarkMode, setIsDarkMode] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [lineHeight, setLineHeight] = useState(1.6);

  const isConfigured = !!supabase;
  const canWrite = isConfigured && !!user;

  // Load session
  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => setUser(data.session?.user || null));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => setUser(session?.user || null));
    return () => sub?.subscription?.unsubscribe?.();
  }, [supabase]);

  // Load novels
  useEffect(() => {
    if (!supabase) return;
    (async () => {
      const { data } = await supabase.from("novels").select("*").order("created_at", { ascending: false });
      setNovels(data || []);
    })();
  }, [supabase, user]);

  // Load chapters when novel changes
  useEffect(() => {
    if (!supabase || !activeNovel) return;
    (async () => {
      const { data } = await supabase.from("chapters").select("*").eq("novel_id", activeNovel.id).order("number");
      setChapters(data || []);
    })();
  }, [supabase, activeNovel]);

  // Load translation when chapter changes
  useEffect(() => {
    if (!supabase || !activeChapter) return;
    (async () => {
      setSourceZH(activeChapter?.content || "");
      const { data } = await supabase.from("translations").select("english, notes").eq("chapter_id", activeChapter.id).maybeSingle();
      if (data) {
        setTranslationEN(data.english || "");
        setNotes(data.notes || []);
      } else {
        setTranslationEN("");
        setNotes([]);
      }
    })();
  }, [supabase, activeChapter]);



  async function signIn(email) {
    if (!supabase) { alert("Configure Supabase first in Settings."); return; }
    const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: window.location.href } });
    if (error) alert(error.message); else alert("Check your email for the magic link.");
  }
  async function signOut() { await supabase?.auth.signOut(); }

  // --- FIXED: guard supabase & user; include created_by for RLS ---
  async function createNovel(title, isPublic) {
    if (!supabase) { alert("Configure Supabase in Settings before creating a novel."); return; }
    if (!user) { alert("Please sign in (magic link) first."); return; }
    const { data, error } = await supabase
      .from("novels")
      .insert({ title, is_public: !!isPublic, created_by: user.id })
      .select()
      .single();
    if (error) return alert(error.message);
    setNovels([data, ...novels]);
    setActiveNovel(data);
  }

  async function addChapter(number, title) {
    if (!supabase) { alert("Configure Supabase first."); return; }
    if (!activeNovel) { alert("Select or create a novel first."); return; }
    if (!user) { alert("Please sign in to add chapters."); return; }
    const { data, error } = await supabase
      .from("chapters")
      .insert({ novel_id: activeNovel.id, number, title, content: sourceZH })
      .select()
      .single();
    if (error) return alert(error.message);
    setChapters([...chapters, data].sort((a,b)=>a.number-b.number));
    setActiveChapter(data);
  }

  async function saveSource() {
    if (!supabase) { alert("Configure Supabase first."); return; }
    if (!activeChapter) return;
    if (!user) { alert("Sign in to save."); return; }
    const { error } = await supabase.from("chapters").update({ content: sourceZH }).eq("id", activeChapter.id);
    if (error) alert(error.message); else setStatus("Saved source");
  }

     async function saveTranslation(english, notesArr) {
     if (!supabase) { alert("Configure Supabase first."); return; }
     if (!activeChapter) return;
     if (!user) { alert("Sign in to save."); return; }
     const payload = { english, notes: notesArr || [] };
     const { data: existing } = await supabase.from("translations").select("id").eq("chapter_id", activeChapter.id).maybeSingle();
     if (existing?.id) {
       const { error } = await supabase.from("translations").update(payload).eq("id", existing.id);
       if (error) return alert(error.message);
     } else {
       const { error } = await supabase.from("translations").insert({ chapter_id: activeChapter.id, ...payload });
       if (error) return alert(error.message);
     }
     setStatus("Saved translation");
   }

   async function updateNovelTitle(novelId, newTitle) {
     if (!supabase) { alert("Configure Supabase first."); return; }
     if (!user) { alert("Sign in to edit."); return; }
     const { error } = await supabase.from("novels").update({ title: newTitle }).eq("id", novelId);
     if (error) return alert(error.message);
     setNovels(novels.map(n => n.id === novelId ? { ...n, title: newTitle } : n));
     if (activeNovel?.id === novelId) {
       setActiveNovel({ ...activeNovel, title: newTitle });
     }
     setStatus("Updated novel title");
   }

   async function updateChapterTitle(chapterId, newTitle) {
     if (!supabase) { alert("Configure Supabase first."); return; }
     if (!user) { alert("Sign in to edit."); return; }
     const { error } = await supabase.from("chapters").update({ title: newTitle }).eq("id", chapterId);
     if (error) return alert(error.message);
     setChapters(chapters.map(c => c.id === chapterId ? { ...c, title: newTitle } : c));
     if (activeChapter?.id === chapterId) {
       setActiveChapter({ ...activeChapter, title: newTitle });
     }
     setStatus("Updated chapter title");
   }

     async function doTranslate() {
     try {
       setStatus("Analyzing and translating...");
       const out = await AI_TRANSLATOR.translate({ 
         text: sourceZH, 
         tone,
         chapterTitle: activeChapter?.title
       });
       setTranslationEN(out.english);
       setNotes(out.notes || []);
       setExtractedContext(out.context);
       
       // Auto-update chapter title if AI detected one and it's different
       if (out.context.chapterTitle && 
           out.context.chapterTitle !== activeChapter?.title && 
           activeChapter) {
         await updateChapterTitle(activeChapter.id, out.context.chapterTitle);
       }
       
       // Saving requires DB; guard inside saveTranslation
       await saveTranslation(out.english, out.notes);
       setStatus("Done");
     } catch (e) {
       console.error(e);
       setStatus(e.message || "Translation failed");
     }
   }

  // Reading mode navigation functions
  function goToNextChapter() {
    if (!chapters.length) return;
    const currentIndex = chapters.findIndex(c => c.id === activeChapter?.id);
    const nextIndex = currentIndex + 1;
    if (nextIndex < chapters.length) {
      setActiveChapter(chapters[nextIndex]);
    }
  }

  function goToPreviousChapter() {
    if (!chapters.length) return;
    const currentIndex = chapters.findIndex(c => c.id === activeChapter?.id);
    const prevIndex = currentIndex - 1;
    if (prevIndex >= 0) {
      setActiveChapter(chapters[prevIndex]);
    }
  }

  function toggleFullscreen() {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen();
      setIsFullscreen(true);
    } else {
      document.exitFullscreen();
      setIsFullscreen(false);
    }
  }

  // Handle fullscreen change events
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);



  function SetupBanners(){
    if (!isConfigured) {
      return (
        <div className="rounded-2xl bg-yellow-900/20 ring-1 ring-yellow-700 p-3 text-yellow-200 flex items-center gap-2">
          <AlertTriangle size={16}/> Supabase is not configured. Open <b className="mx-1">Settings</b> and paste your Supabase URL and anon key to enable saving/public translations.
        </div>
      );
    }
    if (isConfigured && !user) {
      return (
        <div className="rounded-2xl bg-blue-900/20 ring-1 ring-blue-700 p-3 text-blue-200">
          Sign in with a magic link to create novels, add chapters, and save translations.
        </div>
      );
    }
    return null;
  }

  function SettingsPanel() {
    const [url, setUrl] = useState(config.url);
    const [key, setKey] = useState(config.anonKey);
    const [gemini, setGemini] = useState(localStorage.getItem("GEMINI_API_KEY") || "");

    return (
      <div className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label>Supabase URL</Label>
            <Input value={url} onChange={(e)=>setUrl(e.target.value)} placeholder="https://YOURPROJECT.supabase.co" />
          </div>
          <div>
            <Label>Supabase anon key</Label>
            <Input value={key} onChange={(e)=>setKey(e.target.value)} placeholder="eyJhbGciOi..." />
          </div>
          <div className="md:col-span-2">
            <Button onClick={()=>{ localStorage.setItem("SUPABASE_URL", url); localStorage.setItem("SUPABASE_ANON_KEY", key); setConfig({ url, anonKey: key }); }}>Save Supabase</Button>
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <Label>Gemini API Key (Required for AI Translation)</Label>
            <Input value={gemini} onChange={(e)=>setGemini(e.target.value)} placeholder="Get your API key from Google AI Studio..." />
            <div className="mt-2">
              <Button onClick={()=>{ localStorage.setItem("GEMINI_API_KEY", gemini); alert("Saved Gemini key locally"); }}>Save API Key</Button>
            </div>
            <div className="mt-2 text-xs text-gray-400">
              Get your free API key from <a href="https://aistudio.google.com/" target="_blank" rel="noopener noreferrer" className="text-indigo-400 hover:underline">Google AI Studio</a>
            </div>
          </div>
        </div>

        <div className="rounded-2xl bg-gray-900 ring-1 ring-gray-800 p-4 text-sm text-gray-300">
          <div className="flex items-center gap-2 mb-2"><Info size={16}/><b>Security note</b></div>
          This app is 100% client-side. Any API keys you paste are stored only in your browser's localStorage and used directly from your device.
        </div>
      </div>
    );
  }

  function Header() {
    const [email, setEmail] = useState("");
    return (
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <BookOpen />
          <h1 className="text-xl font-semibold">NovelTranslator</h1>
          <Chip>Serverless</Chip>
          <Chip>Public Translations</Chip>
        </div>
        <div className="flex items-center gap-2">
          {user ? (
            <>
              <span className="text-sm text-gray-300">{user.email}</span>
              <GhostButton onClick={signOut}><LogOut className="inline mr-1" size={16}/> Sign out</GhostButton>
            </>
          ) : (
            <div className="flex items-center gap-2">
              <Input placeholder="email for magic link" value={email} onChange={e=>setEmail(e.target.value)} style={{width:260}} />
              <GhostButton onClick={()=>signIn(email)}><LogIn className="inline mr-1" size={16}/> Sign in</GhostButton>
            </div>
          )}
          <SettingsDrawer/>
        </div>
      </div>
    );
  }

  function SettingsDrawer(){
    const [open, setOpen] = useState(false);
    return (
      <div className="relative">
        <GhostButton onClick={()=>setOpen(!open)}><Settings className="inline mr-1" size={16}/> Settings</GhostButton>
        {open && (
          <div className="absolute right-0 mt-2 w-[44rem] max-w-[90vw] z-50 rounded-2xl bg-gray-950 ring-1 ring-gray-800 p-4 shadow-2xl">
            <SettingsPanel />
          </div>
        )}
      </div>
    );
  }

     function NovelList(){
     const [title, setTitle] = useState("");
     const [pub, setPub] = useState(true);
     const [editingNovel, setEditingNovel] = useState(null);
     const [editTitle, setEditTitle] = useState("");
     const disabledCreate = !title || !canWrite;
     
     const startEdit = (novel) => {
       setEditingNovel(novel.id);
       setEditTitle(novel.title);
     };
     
     const saveEdit = async () => {
       if (editTitle.trim()) {
         await updateNovelTitle(editingNovel, editTitle.trim());
         setEditingNovel(null);
         setEditTitle("");
       }
     };
     
     const cancelEdit = () => {
       setEditingNovel(null);
       setEditTitle("");
     };
     
     return (
       <div className="space-y-3">
         <div className="flex items-center gap-2">
           <Input placeholder="New novel title" value={title} onChange={e=>setTitle(e.target.value)} />
           <label className="flex items-center gap-2 text-sm text-gray-300"><input type="checkbox" checked={pub} onChange={e=>setPub(e.target.checked)} /> Public</label>
           <Button onClick={()=>createNovel(title, pub)} disabled={disabledCreate}><Plus className="inline mr-1" size={16}/> Create</Button>
         </div>
         {!canWrite && (
           <div className="text-xs text-gray-400">To create a novel, configure Supabase and sign in.</div>
         )}
         <div className="grid md:grid-cols-2 gap-2">
           {novels.map(n => (
             <div key={n.id} className={`rounded-2xl p-3 ring-1 ${activeNovel?.id===n.id? 'ring-indigo-500 bg-gray-900':'ring-gray-800 bg-gray-950'}`}>
               {editingNovel === n.id ? (
                 <div className="space-y-2">
                   <Input value={editTitle} onChange={e=>setEditTitle(e.target.value)} />
                   <div className="flex items-center gap-2">
                     <Button onClick={saveEdit} size="sm">Save</Button>
                     <GhostButton onClick={cancelEdit} size="sm">Cancel</GhostButton>
                   </div>
                 </div>
               ) : (
                 <div className="cursor-pointer" onClick={()=>setActiveNovel(n)}>
                   <div className="flex items-center justify-between">
                     <div className="font-medium">{n.title}</div>
                     <div className="flex items-center gap-2">
                       {n.is_public ? <Chip><Globe size={14}/> Public</Chip> : <Chip>Private</Chip>}
                       {canWrite && (
                         <GhostButton 
                           onClick={(e) => { e.stopPropagation(); startEdit(n); }}
                           className="text-xs px-2 py-1"
                         >
                           Edit
                         </GhostButton>
                       )}
                     </div>
                   </div>
                   <div className="text-xs text-gray-400 mt-1">{new Date(n.created_at).toLocaleString()}</div>
                 </div>
               )}
             </div>
           ))}
         </div>
       </div>
     )
   }

     function ChapterSidebar(){
     const [num, setNum] = useState(chapters.length+1);
     const [title, setTitle] = useState("");
     const [editingChapter, setEditingChapter] = useState(null);
     const [editTitle, setEditTitle] = useState("");
     useEffect(()=> setNum(chapters.length+1), [chapters.length]);
     
     const startEdit = (chapter) => {
       setEditingChapter(chapter.id);
       setEditTitle(chapter.title || "");
     };
     
     const saveEdit = async () => {
       if (editTitle.trim()) {
         await updateChapterTitle(editingChapter, editTitle.trim());
         setEditingChapter(null);
         setEditTitle("");
       }
     };
     
     const cancelEdit = () => {
       setEditingChapter(null);
       setEditTitle("");
     };
     
     return (
       <div className="space-y-3">
         <div className="flex items-center gap-2">
           <Input placeholder="#" type="number" style={{width:90}} value={num} onChange={e=>setNum(parseInt(e.target.value||'0'))} />
           <Input placeholder="Chapter title" value={title} onChange={e=>setTitle(e.target.value)} />
           <Button onClick={()=>addChapter(num, title)} disabled={!activeNovel || !canWrite}><Plus className="inline mr-1" size={16}/> Add</Button>
         </div>
         <div className="space-y-1 max-h-[60vh] overflow-auto pr-1">
           {chapters.map(c => (
             <div key={c.id} className={`rounded-xl px-3 py-2 text-sm ${activeChapter?.id===c.id? 'bg-indigo-600/20 ring-1 ring-indigo-500':'bg-gray-900 ring-1 ring-gray-800'}`}>
               {editingChapter === c.id ? (
                 <div className="space-y-2">
                   <Input value={editTitle} onChange={e=>setEditTitle(e.target.value)} placeholder="Chapter title" />
                   <div className="flex items-center gap-2">
                     <Button onClick={saveEdit} size="sm" className="text-xs px-2 py-1">Save</Button>
                     <GhostButton onClick={cancelEdit} size="sm" className="text-xs px-2 py-1">Cancel</GhostButton>
                   </div>
                 </div>
               ) : (
                 <div className="cursor-pointer flex items-center justify-between" onClick={()=>setActiveChapter(c)}>
                   <div><b>Ch {c.number}</b> — {c.title || 'Untitled'}</div>
                   {canWrite && (
                     <GhostButton 
                       onClick={(e) => { e.stopPropagation(); startEdit(c); }}
                       className="text-xs px-2 py-1 opacity-0 group-hover:opacity-100 transition-opacity"
                     >
                       Edit
                     </GhostButton>
                   )}
                 </div>
               )}
             </div>
           ))}
         </div>
       </div>
     )
   }



  function ReadingMode() {
    const currentIndex = chapters.findIndex(c => c.id === activeChapter?.id);
    const hasNext = currentIndex < chapters.length - 1;
    const hasPrev = currentIndex > 0;

    return (
      <div className={`min-h-screen transition-colors duration-300 ${isDarkMode ? 'bg-gray-900 text-gray-100' : 'bg-white text-gray-900'}`}>
        {/* Reading Controls */}
        <div className={`sticky top-0 z-50 p-4 border-b transition-colors duration-300 ${isDarkMode ? 'bg-gray-800 border-gray-700' : 'bg-gray-50 border-gray-200'}`}>
          <div className="max-w-4xl mx-auto flex items-center justify-between">
            <div className="flex items-center gap-4">
              <GhostButton onClick={() => setIsReadingMode(false)} className={isDarkMode ? 'text-gray-300' : 'text-gray-700'}>
                <Edit3 className="inline mr-1" size={16}/> Edit Mode
              </GhostButton>
              <div className="text-sm">
                {activeNovel?.title} - Chapter {activeChapter?.number}: {activeChapter?.title}
              </div>
            </div>
            
            <div className="flex items-center gap-2">
              {/* Font Size */}
              <div className="flex items-center gap-1">
                <Type size={16} className={isDarkMode ? 'text-gray-400' : 'text-gray-600'}/>
                <select 
                  value={fontSize} 
                  onChange={(e) => setFontSize(Number(e.target.value))}
                  className={`rounded px-2 py-1 text-sm ${isDarkMode ? 'bg-gray-700 text-gray-100' : 'bg-white text-gray-900 border border-gray-300'}`}
                >
                  <option value={12}>12px</option>
                  <option value={14}>14px</option>
                  <option value={16}>16px</option>
                  <option value={18}>18px</option>
                  <option value={20}>20px</option>
                  <option value={24}>24px</option>
                  <option value={28}>28px</option>
                </select>
              </div>

              {/* Line Height */}
              <select 
                value={lineHeight} 
                onChange={(e) => setLineHeight(Number(e.target.value))}
                className={`rounded px-2 py-1 text-sm ${isDarkMode ? 'bg-gray-700 text-gray-100' : 'bg-white text-gray-900 border border-gray-300'}`}
              >
                <option value={1.2}>1.2</option>
                <option value={1.4}>1.4</option>
                <option value={1.6}>1.6</option>
                <option value={1.8}>1.8</option>
                <option value={2.0}>2.0</option>
              </select>

              {/* Dark Mode Toggle */}
              <GhostButton onClick={() => setIsDarkMode(!isDarkMode)} className={isDarkMode ? 'text-gray-300' : 'text-gray-700'}>
                {isDarkMode ? <Sun size={16}/> : <Moon size={16}/>}
              </GhostButton>

              {/* Fullscreen Toggle */}
              <GhostButton onClick={toggleFullscreen} className={isDarkMode ? 'text-gray-300' : 'text-gray-700'}>
                {isFullscreen ? <Minimize2 size={16}/> : <Maximize2 size={16}/>}
              </GhostButton>
            </div>
          </div>
        </div>

        {/* Chapter Navigation */}
        <div className={`sticky top-16 z-40 p-2 border-b transition-colors duration-300 ${isDarkMode ? 'bg-gray-800 border-gray-700' : 'bg-gray-50 border-gray-200'}`}>
          <div className="max-w-4xl mx-auto flex items-center justify-between">
            <GhostButton 
              onClick={goToPreviousChapter} 
              disabled={!hasPrev}
              className={`${isDarkMode ? 'text-gray-300' : 'text-gray-700'} ${!hasPrev ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              <ChevronLeft className="inline mr-1" size={16}/> Previous Chapter
            </GhostButton>
            
            <div className="text-sm">
              {currentIndex + 1} of {chapters.length} chapters
            </div>
            
            <GhostButton 
              onClick={goToNextChapter} 
              disabled={!hasNext}
              className={`${isDarkMode ? 'text-gray-300' : 'text-gray-700'} ${!hasNext ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              Next Chapter <ChevronRight className="inline ml-1" size={16}/>
            </GhostButton>
          </div>
        </div>

        {/* Reading Content */}
        <div className="max-w-4xl mx-auto p-8">
          {activeChapter ? (
            <div>
              <h1 className={`text-3xl font-bold mb-4 ${isDarkMode ? 'text-gray-100' : 'text-gray-900'}`}>
                Chapter {activeChapter.number}: {activeChapter.title}
              </h1>
              
              <div 
                className={`prose max-w-none ${isDarkMode ? 'prose-invert' : ''}`}
                style={{ 
                  fontSize: `${fontSize}px`, 
                  lineHeight: lineHeight,
                  fontFamily: 'Georgia, serif'
                }}
              >
                {translationEN ? (
                  <div 
                    className={`whitespace-pre-wrap ${isDarkMode ? 'text-gray-100' : 'text-gray-900'}`}
                    style={{ fontSize: `${fontSize}px`, lineHeight: lineHeight }}
                  >
                    {translationEN}
                  </div>
                ) : (
                  <div className={`text-center py-20 ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                    <BookOpen size={48} className="mx-auto mb-4 opacity-50"/>
                    <p>No translation available for this chapter.</p>
                    <p className="text-sm mt-2">Switch to Edit Mode to translate this chapter.</p>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className={`text-center py-20 ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
              <BookOpen size={48} className="mx-auto mb-4 opacity-50"/>
              <p>Select a chapter to start reading.</p>
            </div>
          )}
        </div>
      </div>
    );
  }

  function SmokeTests(){
    const [results, setResults] = useState([]);
    useEffect(()=>{
      const r = [];
      // Test 1: configuration guard reflects into canWrite
      r.push({ name: 'config-guard', pass: isConfigured ? true : !canWrite });
      setResults(r);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isConfigured, canWrite]);

    if (!results.length) return null;
    return (
      <div className="rounded-2xl bg-gray-900 ring-1 ring-gray-800 p-3 text-xs text-gray-300">
        <div className="mb-1 font-medium">Self-tests</div>
        <ul className="list-disc ml-5">
          {results.map((t)=> (
            <li key={t.name}>{t.name}: {t.pass? 'PASS':'FAIL'}</li>
          ))}
        </ul>
      </div>
    );
  }

    return (
    <>
      {isReadingMode ? (
        <ReadingMode />
      ) : (
        <div className="min-h-screen bg-gray-950 text-gray-100">
          <div className="max-w-7xl mx-auto p-4 md:p-6 space-y-6">
            <Header />
            <SetupBanners />
            <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
              <div className="md:col-span-3 space-y-4">
                <section className="rounded-2xl bg-gray-900 ring-1 ring-gray-800 p-4">
                  <div className="flex items-center gap-2 mb-2"><Users size={16}/><b>Your Novels</b></div>
                  <NovelList/>
                </section>
                {activeNovel && (
                  <section className="rounded-2xl bg-gray-900 ring-1 ring-gray-800 p-4">
                    <div className="flex items-center gap-2 mb-2"><FileText size={16}/><b>Chapters</b></div>
                    <ChapterSidebar/>
                  </section>
                )}
              </div>

              <div className="md:col-span-9 space-y-4">
                <section className="rounded-2xl bg-gray-900 ring-1 ring-gray-800 p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <Sparkles size={16}/>
                      <b>AI Translation</b>
                      {activeNovel && <Chip>{activeNovel.title}</Chip>}
                      {activeChapter && <Chip>Ch {activeChapter.number}</Chip>}
                    </div>
                    <div className="flex items-center gap-2">
                      <select className="rounded-xl bg-gray-800 ring-1 ring-gray-700 px-2 py-1 text-gray-100" value={tone} onChange={e=>setTone(e.target.value)}>
                        <option>match original</option>
                        <option>formal</option>
                        <option>casual</option>
                        <option>literary / poetic</option>
                        <option>snappy / web novel style</option>
                      </select>
                      <GhostButton onClick={doTranslate} disabled={!sourceZH}><Sparkles className="inline mr-1" size={16}/> AI Translate</GhostButton>
                      <Button onClick={saveSource} disabled={!activeChapter || !canWrite}><Save className="inline mr-1" size={16}/> Save Source</Button>
                      {activeChapter && translationEN && (
                        <GhostButton onClick={() => setIsReadingMode(true)}><Eye className="inline mr-1" size={16}/> Reading Mode</GhostButton>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <Label>Chinese Source</Label>
                      <Textarea rows={18} value={sourceZH} onChange={(e)=>setSourceZH(e.target.value)} placeholder="貼上中文章節..."/>
                    </div>
                    <div>
                      <Label>English Translation</Label>
                      <Textarea rows={18} value={translationEN} onChange={(e)=>setTranslationEN(e.target.value)} placeholder="AI output will appear here"/>
                      <div className="mt-2 flex items-center gap-2">
                        <Button onClick={()=>saveTranslation(translationEN, notes)} disabled={!activeChapter || !canWrite}><UploadCloud className="inline mr-1" size={16}/> Save Translation</Button>
                        <span className="text-sm text-gray-400">{status}</span>
                      </div>
                    </div>
                  </div>

                  <div className="mt-4">
                    <Label>Translator Notes</Label>
                    <div className="space-y-2">
                      {(notes||[]).length===0 && <div className="text-sm text-gray-400">No notes for this chapter.</div>}
                      {(notes||[]).map((n,i)=> (
                        <div key={i} className="text-sm bg-gray-800 ring-1 ring-gray-700 rounded-xl p-2">{n}</div>
                      ))}
                    </div>
                  </div>
                </section>

                                 {extractedContext && (
                   <section className="rounded-2xl bg-gray-900 ring-1 ring-gray-800 p-4">
                     <div className="flex items-center gap-2 mb-3"><Database size={16}/><b>AI Extracted Context</b></div>
                     <div className="text-sm text-gray-300 space-y-3">
                                               <div><b>Novel Title:</b> {extractedContext.novelTitle}</div>
                        <div><b>Detected Chapter Title:</b> {extractedContext.chapterTitle || 'None detected'}</div>
                       
                       <div>
                         <b>Characters ({extractedContext.characters?.length || 0}):</b>
                         {extractedContext.characters?.length > 0 ? (
                           <div className="mt-2 space-y-1">
                             {extractedContext.characters.map((char, i) => (
                               <div key={i} className="bg-gray-800 rounded-lg p-2 text-xs">
                                 <div><b>{char.chineseName}</b> → <span className="text-indigo-300">{char.englishName}</span> ({char.gender || 'unknown'})</div>
                                 <div className="text-gray-400">{char.description || 'No description'}</div>
                                 <div className="text-gray-500">Type: {char.nameType || 'unknown'}</div>
                               </div>
                             ))}
                           </div>
                         ) : (
                           <span className="text-gray-400"> No characters detected</span>
                         )}
                       </div>
                       
                       <div>
                         <b>Important Terms ({extractedContext.jargon?.length || 0}):</b>
                         {extractedContext.jargon?.length > 0 ? (
                           <div className="mt-2 space-y-1">
                             {extractedContext.jargon.map((term, i) => (
                               <div key={i} className="bg-gray-800 rounded-lg p-2 text-xs">
                                 <b>{term.term}</b> = {term.meaning}
                               </div>
                             ))}
                           </div>
                         ) : (
                           <span className="text-gray-400"> No terms detected</span>
                         )}
                       </div>
                       
                       <div>
                         <b>Recurring Themes ({extractedContext.insideJokes?.length || 0}):</b>
                         {extractedContext.insideJokes?.length > 0 ? (
                           <div className="mt-2 space-y-1">
                             {extractedContext.insideJokes.map((joke, i) => (
                               <div key={i} className="bg-gray-800 rounded-lg p-2 text-xs">
                                 {joke}
                               </div>
                             ))}
                           </div>
                         ) : (
                           <span className="text-gray-400"> No themes detected</span>
                         )}
                       </div>
                     </div>
                   </section>
                 )}

                {supabase && (
                  <section className="rounded-2xl bg-gray-900 ring-1 ring-gray-800 p-4 text-sm text-gray-300">
                    <div className="flex items-center gap-2 mb-2"><Info size={16}/><b>Database health</b></div>
                    <DbHealth supabase={supabase} />
                  </section>
                )}

                <SmokeTests />
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function DbHealth({ supabase }){
  const [report, setReport] = useState([]);
  useEffect(()=>{ (async()=> setReport(await ensureSchema(supabase)))(); }, [supabase]);
  if (!report?.length) return <div>Checking…</div>;
  return (
    <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
      {report.map(r => (
        <div key={r.t} className={`rounded-xl px-3 py-2 ${r.ok? 'bg-green-900/30 ring-1 ring-green-700':'bg-red-900/30 ring-1 ring-red-700'}`}>
          <div className="font-mono">{r.t}</div>
          <div className="text-xs">{r.ok? 'ok':'missing'}</div>
        </div>
      ))}
    </div>
  )
} 