import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { createClient } from "@supabase/supabase-js";
import * as XLSX from "xlsx";

// קריאת משתני סביבה (Secrets) או גיבוי מה-HTML
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || window.__SUPABASE_URL__ || "";
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || window.__SUPABASE_ANON_KEY__ || "";
if (!SUPABASE_URL || !SUPABASE_KEY) {
  alert("חסר SUPABASE URL/KEY – הגדר ב-Secrets או ב-index.html/list.html");
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const db = supabase.schema("comp");

// UI helpers
const Label = ({ children }) => <label className="block text-sm mb-1 font-medium">{children}</label>;
const Input = (p) => <input {...p} className={`w-full rounded-2xl border px-3 py-2 ${p.className||""}`} />;
const Select = (p) => <select {...p} className={`w-full rounded-2xl border px-3 py-2 ${p.className||""}`} />;
const Button = ({ children, className="", ...rest }) => <button {...rest} className={`rounded-2xl px-4 py-2 shadow-sm border ${className}`}>{children}</button>;
function normalizePhone(v){ return (v||"").replace(/\D/g,""); }

function Login(){
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  async function signin(e){
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if(error) alert("שגיאת התחברות: " + error.message);
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <form onSubmit={signin} className="w-[min(92vw,420px)] border rounded-2xl p-5 grid gap-3">
        <h1 className="text-2xl font-bold mb-2 text-center">כניסה – רשימת פיצויים</h1>
        <div>
          <Label>שם משתמש (אימייל)</Label>
          <Input required type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="name@example.com" />
        </div>
        <div>
          <Label>סיסמה</Label>
          <Input required type="password" value={password} onChange={e=>setPassword(e.target.value)} />
        </div>
        <Button type="submit" className="bg-black text-white" disabled={loading}>{loading?"מתחבר...":"כניסה"}</Button>
      </form>
    </div>
  );
}

function App(){
  // auth
  const [session, setSession] = useState(null);
  useEffect(()=>{
    supabase.auth.getSession().then(({ data })=> setSession(data.session||null));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, s)=> setSession(s));
    return ()=> subscription.unsubscribe();
  },[]);

  // filters
  const [phone, setPhone] = useState("");
  const [nameLike, setNameLike] = useState("");
  const [status, setStatus] = useState("all"); // all | open | redeemed
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  // data
  const [rows, setRows] = useState([]);
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(false);

  // pagination
  const pageSize = 50;
  const [page, setPage] = useState(1);
  const totalPages = useMemo(()=> Math.max(1, Math.ceil(count / pageSize)), [count]);

  async function fetchList(p=page){
    if(!session) { alert("יש להתחבר למערכת"); return; }
    setLoading(true);
    let query = db
      .from("customers_coupons")
      .select("*", { count: "exact" })
      .order("created_at", { ascending: false });

    // סינון מצב
    if(status === "open") query = query.eq("redeemed", false);
    if(status === "redeemed") query = query.eq("redeemed", true);

    // טלפון – אם הוזן 9–10 ספרות, נשתמש ב-eq
    const ph = normalizePhone(phone);
    if(ph.length >= 9) query = query.eq("phone", ph);

    // שם – ilike
    if(nameLike.trim()) query = query.ilike("name", `%${nameLike.trim()}%`);

    // טווח תאריכים (לפי created_at)
    if(dateFrom) query = query.gte("created_at", new Date(dateFrom).toISOString());
    if(dateTo) {
      const end = new Date(dateTo);
      end.setHours(23,59,59,999);
      query = query.lte("created_at", end.toISOString());
    }

    // עימוד
    const from = (p-1)*pageSize;
    const to   = from + pageSize - 1;
    query = query.range(from, to);

    const { data, error, count: total } = await query;
    setLoading(false);
    if(error){ alert("שגיאה בטעינה: " + error.message); return; }

    setRows(data || []);
    setCount(total || 0);
    setPage(p);
  }

  function exportToExcel(){
    const data = rows.map(r => ({
      טלפון: r.phone,
      "שם הלקוח": r.name,
      "קופון": r.coupon_type,
      "סיבת הפיצוי": r.reason || "",
      "שם מאשר הפיצוי": r.created_by || "",
      "נוצר ב־": r.created_at ? new Date(r.created_at).toLocaleString() : "",
      "סטטוס": r.redeemed ? "מומש" : "פתוח",
      "מומש ב־": r.redeemed_at ? new Date(r.redeemed_at).toLocaleString() : "",
      "מאשר המימוש": r.redeemed_by || ""
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "פיצויים");
    XLSX.writeFile(wb, "coupons_list.xlsx");
  }

  if(!session) return <Login />;

  return (
    <div className="p-4 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold">רשימת פיצויים</h1>
        <div className="flex items-center gap-2">
          <Button onClick={()=>window.location.href = "./index.html"}>לעמוד ניהול</Button>
          <Button onClick={()=> supabase.auth.signOut()} className="bg-gray-100">התנתק</Button>
        </div>
      </div>

      {/* Filters */}
      <div className="grid md:grid-cols-6 gap-3 border rounded-2xl p-4 mb-4">
        <div className="md:col-span-2">
          <Label>טלפון</Label>
          <Input value={phone} onChange={e=>setPhone(e.target.value.replace(/\D/g,""))} placeholder="05XXXXXXXX" />
        </div>
        <div className="md:col-span-2">
          <Label>שם הלקוח</Label>
          <Input value={nameLike} onChange={e=>setNameLike(e.target.value)} placeholder="חיפוש לפי שם" />
        </div>
        <div>
          <Label>מצב</Label>
          <Select value={status} onChange={e=>setStatus(e.target.value)}>
            <option value="all">כולם</option>
            <option value="open">פתוחים</option>
            <option value="redeemed">מומשו</option>
          </Select>
        </div>
        <div className="md:col-span-3">
          <Label>מתאריך</Label>
          <Input type="date" value={dateFrom} onChange={e=>setDateFrom(e.target.value)} />
        </div>
        <div className="md:col-span-3">
          <Label>עד תאריך</Label>
          <Input type="date" value={dateTo} onChange={e=>setDateTo(e.target.value)} />
        </div>
        <div className="md:col-span-6 flex gap-2">
          <Button onClick={()=>fetchList(1)} className="bg-black text-white">חפש</Button>
          <Button onClick={exportToExcel}>יצוא לאקסל</Button>
        </div>
      </div>

      {/* Summary */}
      <div className="flex items-center justify-between mb-2">
        <div>נמצאו <b>{count}</b> רשומות</div>
        <div className="flex gap-2">
          <Button disabled={page<=1} onClick={()=>fetchList(page-1)}>הקודם</Button>
          <span className="px-2 py-2">עמוד {page} מתוך {totalPages}</span>
          <Button disabled={page>=totalPages} onClick={()=>fetchList(page+1)}>הבא</Button>
        </div>
      </div>

      {/* Table */}
      <div className="border rounded-2xl p-2 overflow-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr>
              <th className="text-right p-2">טלפון</th>
              <th className="text-right p-2">שם הלקוח</th>
              <th className="text-right p-2">קופון</th>
              <th className="text-right p-2">סיבה</th>
              <th className="text-right p-2">שם מאשר הפיצוי</th>
              <th className="text-right p-2">נוצר ב־</th>
              <th className="text-right p-2">סטטוס</th>
              <th className="text-right p-2">מומש ב־</th>
              <th className="text-right p-2">מאשר המימוש</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r=>(
              <tr key={r.id} className="border-t">
                <td className="p-2 whitespace-nowrap">{r.phone}</td>
                <td className="p-2 whitespace-nowrap">{r.name}</td>
                <td className="p-2">{r.coupon_type}</td>
                <td className="p-2">{r.reason || "—"}</td>
                <td className="p-2">{r.created_by || "—"}</td>
                <td className="p-2 whitespace-nowrap">{r.created_at ? new Date(r.created_at).toLocaleString() : "—"}</td>
                <td className="p-2">{r.redeemed ? "מומש" : "פתוח"}</td>
                <td className="p-2 whitespace-nowrap">{r.redeemed_at ? new Date(r.redeemed_at).toLocaleString() : "—"}</td>
                <td className="p-2">{r.redeemed_by || "—"}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td className="p-3 text-center" colSpan={9}>אין נתונים להצגה</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

createRoot(document.getElementById("root")).render(<App />);
