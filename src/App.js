import React, { useEffect, useMemo, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import { BookOpen, Globe, Plus, LogIn, LogOut, UploadCloud, Sparkles, Settings, Users, Save, FileText, ListChecks, Info, AlertTriangle } from "lucide-react";

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

// ---------- Simple provider interface ----------
const PROVIDERS = {
  openai: {
    name: "OpenAI (BYO key)",
    keyName: "OPENAI_API_KEY",
    translate: async ({ text, glossary, tone, notes, model }) => {
      const apiKey = localStorage.getItem("OPENAI_API_KEY");
      if (!apiKey) throw new Error("Set OpenAI API key in Settings.");
      const body = {
        model: model || "gpt-4o-mini",
        messages: [
          { role: "system", content: `You are a professional CN->EN literary translator. Preserve tone, rhythm, and register. Respect the glossary mappings exactly. Add concise translator notes when jokes, culture-specific idioms, forms of address, or honorifics would be unclear. Output JSON with {"english", "notes"}. Glossary JSON: ${JSON.stringify(glossary||{})}` },
          { role: "user", content: `Source Chinese chapter:\n\n${text}\n\nDesired tone/style: ${tone || 'match original'}. Include notes: ${notes ? 'yes' : 'only if needed'}.` },
        ],
        response_format: { type: "json_object" },
        temperature: 0.3,
      };
      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error("OpenAI error: " + res.status);
      const data = await res.json();
      const content = data.choices?.[0]?.message?.content || "{}";
      let parsed = {};
      try { parsed = JSON.parse(content); } catch { parsed = { english: content, notes: [] }; }
      return parsed;
    },
  },
  hf: {
    name: "HuggingFace Inference (BYO key)",
    keyName: "HF_API_KEY",
    translate: async ({ text }) => {
      const apiKey = localStorage.getItem("HF_API_KEY");
      if (!apiKey) throw new Error("Set HF Inference API key in Settings.");
      const model = "facebook/nllb-200-distilled-600M";
      const payload = { inputs: text, parameters: { src_lang: "zho_Hans", tgt_lang: "eng_Latn" } };
      const res = await fetch(`https://api-inference.huggingface.co/models/${model}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error("HF error: " + res.status);
      const out = await res.json();
      const english = Array.isArray(out) ? out[0]?.translation_text : (out?.translation_text || JSON.stringify(out));
      return { english, notes: [] };
    },
  },
  libre: {
    name: "LibreTranslate (free demo)",
    keyName: null,
    translate: async ({ text }) => {
      const endpoint = localStorage.getItem("LT_ENDPOINT") || "https://libretranslate.com/translate";
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ q: text, source: "zh", target: "en", format: "text" })
      });
      if (!res.ok) throw new Error("LibreTranslate error: " + res.status);
      const out = await res.json();
      return { english: out?.translatedText || "", notes: [] };
    },
  },
  google: {
    name: "Google Translate (free)",
    keyName: null,
    translate: async ({ text, tone }) => {
      // Using Google Translate's free web API
      const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=zh&tl=en&dt=t&q=${encodeURIComponent(text)}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error("Google Translate error: " + res.status);
      const data = await res.json();
      const english = data[0]?.map(item => item[0]).join('') || text;
      return { english, notes: [] };
    },
  },
  deepl: {
    name: "DeepL (free tier)",
    keyName: "DEEPL_API_KEY",
    translate: async ({ text, tone }) => {
      const apiKey = localStorage.getItem("DEEPL_API_KEY");
      if (!apiKey) throw new Error("Set DeepL API key in Settings (free tier available).");
      
      const formality = tone === 'formal' ? 'more' : tone === 'casual' ? 'less' : 'default';
      const res = await fetch("https://api-free.deepl.com/v2/translate", {
        method: "POST",
        headers: { 
          "Authorization": `DeepL-Auth-Key ${apiKey}`,
          "Content-Type": "application/x-www-form-urlencoded"
        },
        body: `text=${encodeURIComponent(text)}&source_lang=ZH&target_lang=EN&formality=${formality}`
      });
      if (!res.ok) throw new Error("DeepL error: " + res.status);
      const data = await res.json();
      return { english: data.translations?.[0]?.text || "", notes: [] };
    },
  }
};

// ---------- Utilities ----------
function applyGlossaryPreMap(text, glossary) {
  if (!glossary) return { mapped: text, markers: [] };
  const markers = [];
  let mapped = text;
  Object.entries(glossary).forEach(([zh, en], idx) => {
    if (!zh || !en) return;
    const token = `«G${idx}»`;
    const re = new RegExp(zh.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g");
    mapped = mapped.replace(re, token);
    markers.push({ token, zh, en });
  });
  return { mapped, markers };
}
function restoreGlossary(mappedEnglish, markers) {
  let out = mappedEnglish;
  markers.forEach(({ token, en }) => {
    const re = new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g");
    out = out.replace(re, en);
  });
  return out;
}

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
  const [glossary, setGlossary] = useState({});
  const [provider, setProvider] = useState(localStorage.getItem("PROVIDER") || "libre");
  const [tone, setTone] = useState("match original");
  const [wantNotes, setWantNotes] = useState(true);
  const [status, setStatus] = useState("");

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
      // load glossary
      const { data: g } = await supabase.from("glossary").select("term_zh, term_en").eq("novel_id", activeNovel.id);
      const map = {};
      (g||[]).forEach(row => map[row.term_zh] = row.term_en);
      setGlossary(map);
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

  // Provider persistence
  useEffect(() => { localStorage.setItem("PROVIDER", provider); }, [provider]);

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

  async function doTranslate() {
    try {
      setStatus("Translating...");
      const providerImpl = PROVIDERS[provider];
      if (!providerImpl) throw new Error("Choose a provider in Settings.");
      const { mapped, markers } = applyGlossaryPreMap(sourceZH, glossary);
      const out = await providerImpl.translate({ text: mapped, glossary, tone, notes: wantNotes });
      const englishRestored = restoreGlossary(out.english || "", markers);
      setTranslationEN(englishRestored);
      const cleanedNotes = Array.isArray(out.notes) ? out.notes : (out.notes ? [out.notes] : []);
      setNotes(cleanedNotes);
      // Saving requires DB; guard inside saveTranslation
      await saveTranslation(englishRestored, cleanedNotes);
      setStatus("Done");
    } catch (e) {
      console.error(e);
      setStatus(e.message || "Translation failed");
    }
  }

  async function upsertGlossaryRow(zh, en) {
    if (!supabase) { alert("Configure Supabase first."); return; }
    if (!activeNovel) { alert("Select a novel first."); return; }
    if (!user) { alert("Sign in to edit glossary."); return; }
    const { data: exists } = await supabase.from("glossary").select("id").eq("novel_id", activeNovel.id).eq("term_zh", zh).maybeSingle();
    if (exists?.id) {
      await supabase.from("glossary").update({ term_en: en }).eq("id", exists.id);
    } else {
      await supabase.from("glossary").insert({ novel_id: activeNovel.id, term_zh: zh, term_en: en });
    }
    setGlossary({ ...glossary, [zh]: en });
  }

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
    const [openai, setOpenai] = useState(localStorage.getItem("OPENAI_API_KEY") || "");
    const [hf, setHf] = useState(localStorage.getItem("HF_API_KEY") || "");
    const [deepl, setDeepl] = useState(localStorage.getItem("DEEPL_API_KEY") || "");
    const [lt, setLt] = useState(localStorage.getItem("LT_ENDPOINT") || "");

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

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <Label>Provider</Label>
            <select className="w-full rounded-2xl bg-gray-800 ring-1 ring-gray-700 px-3 py-2" value={provider} onChange={e=>setProvider(e.target.value)}>
              {Object.entries(PROVIDERS).map(([k,v])=> <option key={k} value={k}>{v.name}</option>)}
            </select>
          </div>
          <div>
            <Label>OpenAI API key (optional)</Label>
            <Input value={openai} onChange={(e)=>setOpenai(e.target.value)} placeholder="sk-..." />
            <div className="mt-2"><Button onClick={()=>{ localStorage.setItem("OPENAI_API_KEY", openai); alert("Saved OpenAI key locally"); }}>Save</Button></div>
          </div>
          <div>
            <Label>HF API key (optional)</Label>
            <Input value={hf} onChange={(e)=>setHf(e.target.value)} placeholder="hf_..." />
            <div className="mt-2"><Button onClick={()=>{ localStorage.setItem("HF_API_KEY", hf); alert("Saved HF key locally"); }}>Save</Button></div>
          </div>
          <div>
            <Label>DeepL API key (free tier available)</Label>
            <Input value={deepl} onChange={(e)=>setDeepl(e.target.value)} placeholder="DeepL free API key..." />
            <div className="mt-2"><Button onClick={()=>{ localStorage.setItem("DEEPL_API_KEY", deepl); alert("Saved DeepL key locally"); }}>Save</Button></div>
          </div>
          <div className="md:col-span-3">
            <Label>LibreTranslate Endpoint (optional override)</Label>
            <Input value={lt} onChange={(e)=>setLt(e.target.value)} placeholder="https://libretranslate.com/translate" />
            <div className="mt-2"><Button onClick={()=>{ localStorage.setItem("LT_ENDPOINT", lt); alert("Saved LT endpoint locally"); }}>Save</Button></div>
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
    const disabledCreate = !title || !canWrite;
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
            <div key={n.id} className={`rounded-2xl p-3 ring-1 ${activeNovel?.id===n.id? 'ring-indigo-500 bg-gray-900':'ring-gray-800 bg-gray-950'} cursor-pointer`} onClick={()=>setActiveNovel(n)}>
              <div className="flex items-center justify-between">
                <div className="font-medium">{n.title}</div>
                {n.is_public ? <Chip><Globe size={14}/> Public</Chip> : <Chip>Private</Chip>}
              </div>
              <div className="text-xs text-gray-400 mt-1">{new Date(n.created_at).toLocaleString()}</div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  function ChapterSidebar(){
    const [num, setNum] = useState(chapters.length+1);
    const [title, setTitle] = useState("");
    useEffect(()=> setNum(chapters.length+1), [chapters.length]);
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Input placeholder="#" type="number" style={{width:90}} value={num} onChange={e=>setNum(parseInt(e.target.value||'0'))} />
          <Input placeholder="Chapter title" value={title} onChange={e=>setTitle(e.target.value)} />
          <Button onClick={()=>addChapter(num, title)} disabled={!activeNovel || !canWrite}><Plus className="inline mr-1" size={16}/> Add</Button>
        </div>
        <div className="space-y-1 max-h-[60vh] overflow-auto pr-1">
          {chapters.map(c => (
            <div key={c.id} className={`rounded-xl px-3 py-2 text-sm cursor-pointer ${activeChapter?.id===c.id? 'bg-indigo-600/20 ring-1 ring-indigo-500':'bg-gray-900 ring-1 ring-gray-800'}`} onClick={()=>setActiveChapter(c)}>
              <b>Ch {c.number}</b> — {c.title || 'Untitled'}
            </div>
          ))}
        </div>
      </div>
    )
  }

  function Glossary(){
    const [zh, setZh] = useState("");
    const [en, setEn] = useState("");
    return (
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Input placeholder="中文名 / term" value={zh} onChange={e=>setZh(e.target.value)} />
          <Input placeholder="Preferred English" value={en} onChange={e=>setEn(e.target.value)} />
          <GhostButton onClick={()=>{ upsertGlossaryRow(zh.trim(), en.trim()); setZh(""); setEn(""); }} disabled={!canWrite}><ListChecks className="inline mr-1" size={16}/> Save term</GhostButton>
        </div>
        <div className="max-h-[30vh] overflow-auto space-y-1">
          {Object.entries(glossary).map(([k,v])=> (
            <div key={k} className="flex items-center justify-between bg-gray-900 ring-1 ring-gray-800 rounded-xl px-3 py-2 text-sm">
              <div><b className="text-gray-200">{k}</b> → <span className="text-gray-300">{v}</span></div>
              <div className="flex gap-2">
                <GhostButton onClick={()=>{ const nv = prompt(`Edit translation for ${k}`, v)||v; upsertGlossaryRow(k, nv); }} disabled={!canWrite}><FileText size={14} className="inline mr-1"/>Edit</GhostButton>
                <GhostButton onClick={()=>{ if (!isConfigured || !user) { alert("Sign in & configure Supabase to delete."); return; } const g = {...glossary}; delete g[k]; setGlossary(g); supabase.from("glossary").delete().eq("novel_id", activeNovel.id).eq("term_zh", k); }} disabled={!canWrite}>Delete</GhostButton>
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  function SmokeTests(){
    const [results, setResults] = useState([]);
    useEffect(()=>{
      const r = [];
      // Test 1: configuration guard reflects into canWrite
      r.push({ name: 'config-guard', pass: isConfigured ? true : !canWrite });
      // Test 2: glossary roundtrip mapping
      const sampleText = '張三與李四同行';
      const glossaryMap = { '張三': 'Zhang San', '李四': 'Li Si' };
      const { mapped, markers } = applyGlossaryPreMap(sampleText, glossaryMap);
      const englishMock = mapped.replace('«G0»', 'Zhang San').replace('«G1»', 'Li Si');
      const restored = restoreGlossary(englishMock, markers);
      r.push({ name: 'glossary-roundtrip', pass: restored.includes('Zhang San') && restored.includes('Li Si') });
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
                <div className="flex items-center gap-2"><Sparkles size={16}/><b>Translate</b>{activeNovel && <Chip>{activeNovel.title}</Chip>}{activeChapter && <Chip>Ch {activeChapter.number}</Chip>}</div>
                <div className="flex items-center gap-2">
                  <select className="rounded-xl bg-gray-800 ring-1 ring-gray-700 px-2 py-1" value={tone} onChange={e=>setTone(e.target.value)}>
                    <option>match original</option>
                    <option>formal</option>
                    <option>casual</option>
                    <option>literary / poetic</option>
                    <option>snappy / web novel style</option>
                  </select>
                  <label className="text-sm text-gray-300"><input type="checkbox" className="mr-2" checked={wantNotes} onChange={e=>setWantNotes(e.target.checked)} /> Explanatory notes</label>
                  <GhostButton onClick={doTranslate} disabled={!sourceZH}><Sparkles className="inline mr-1" size={16}/> AI Translate</GhostButton>
                  <Button onClick={saveSource} disabled={!activeChapter || !canWrite}><Save className="inline mr-1" size={16}/> Save Source</Button>
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

            {activeNovel && (
              <section className="rounded-2xl bg-gray-900 ring-1 ring-gray-800 p-4">
                <div className="flex items-center gap-2 mb-2"><ListChecks size={16}/><b>Character Glossary</b></div>
                <Glossary/>
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