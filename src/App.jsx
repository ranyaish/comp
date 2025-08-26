import React, { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import * as XLSX from "xlsx";

/**
 * Compensation Manager – RTL (Hebrew)
 * דרישות:
 * - זיהוי אך ורק לפי מספר טלפון (ספרות בלבד). השם לשימוש תצוגה בלבד.
 * - מודאל בחירת קופון: פוקאצ'ה / 2 תוספות / קינוח / סכום זיכוי (כולל שדה סכום).
 * - תהליך הזנה: טלפון, שם, קופון, סיבת פיצוי, ע"י מי הוזן.
 * - מימוש: כפתור "ממש" עם שם מאשר + שמירת תאריך המימוש.
 * - כרטיס לקוח: כל הפיצויים (פתוחים + מומשים) לפי טלפון.
 */

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL || window.__SUPABASE_URL__ || "",
  import.meta.env.VITE_SUPABASE_ANON_KEY || window.__SUPABASE_ANON_KEY__ || ""
);

// UI
const Label = ({ children }) => <label className="block text-sm mb-1 font-medium">{children}</label>;
const Input = (props) => <input {...props} className={`w-full rounded-2xl border px-3 py-2 focus:outline-none focus:ring-2 focus:ring-black/40 ${props.className||""}`} />;
const Textarea = (props) => <textarea {...props} className={`w-full rounded-2xl border px-3 py-2 focus:outline-none focus:ring-2 focus:ring-black/40 ${props.className||""}`} />;
const Button = ({ children, className="", ...rest }) => <button {...rest} className={`rounded-2xl px-4 py-2 shadow-sm border hover:shadow transition ${className}`}>{children}</button>;

function normalizePhone(v){ return (v||"").replace(/\D/g, ""); }
const phoneRegex = /^0?5\d{8}$/; // 05XXXXXXXX
// בדיקת תקינות לפני insert
if(!phoneRegex.test(ph)) return alert("מספר טלפון לא תקין (נדרש 05XXXXXXXX)");
const COUPONS = [
  { key: "FOCACCIA", label: "פוקאצ'ה לבחירה" },
  { key: "TOPPINGS2", label: "2 תוספות לבחירה" },
  { key: "DESSERT", label: "קינוח לבחירה" },
  { key: "CREDIT", label: "סכום זיכוי" },
];

function Modal({ open, onClose, children, title }){
  if(!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-xl w-[min(92vw,560px)] max-h-[85vh] overflow-auto p-5">
        {title && <h3 className="text-lg font-semibold mb-3">{title}</h3>}
        {children}
        <div className="mt-4 text-right">
          <Button onClick={onClose}>סגור</Button>
        </div>
      </div>
    </div>
  );
}

export default function App(){
  const [rtl, setRtl] = useState(true);
  const [loading, setLoading] = useState(false);

  // Search & card
  const [queryPhone, setQueryPhone] = useState("");
  const [rows, setRows] = useState([]); // all compensations for phone

  // Add compensation form
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [reason, setReason] = useState("");
  const [createdBy, setCreatedBy] = useState("");

  // Coupon picker modal
  const [couponModalOpen, setCouponModalOpen] = useState(false);
  const [couponType, setCouponType] = useState("");
  const [creditAmount, setCreditAmount] = useState("");

  // Import
  const [importing, setImporting] = useState(false);
  const fileRef = useRef(null);

  useEffect(()=>{ document.documentElement.dir = rtl ? "rtl" : "ltr"; },[rtl]);
  const phoneValid = useMemo(()=> phoneRegex.test(phone), [phone]);

  async function fetchByPhone(p){
    const ph = normalizePhone(p);
    if(!ph){ setRows([]); return; }
    setLoading(true);
    const { data, error } = await supabase
      .from("comp.customers_coupons")
      .select("*")
      .eq("phone", ph)
      .order("created_at", { ascending: false });
    setLoading(false);
    if(error) return alert("שגיאה בטעינה: "+error.message);
    setRows(data||[]);
  }

  useEffect(()=>{ const t=setTimeout(()=>fetchByPhone(queryPhone), 350); return ()=>clearTimeout(t); }, [queryPhone]);

  function openCouponModal(){ setCouponModalOpen(true); }
  function chooseCoupon(key){ setCouponType(key); }

  async function addCoupon(e){
    e.preventDefault();
    const ph = normalizePhone(phone);
    if(!phoneRegex.test(ph)) return alert("מספר טלפון לא תקין (נדרש 05XXXXXXXX)");
    if(!name.trim()) return alert("יש להזין שם לקוח");
    if(!couponType) return alert("יש לבחור קופון פיצוי");
    if(couponType === "CREDIT" && (!creditAmount || isNaN(Number(creditAmount)))) return alert("יש להזין סכום זיכוי מספרי");

    const couponText = (couponType === "CREDIT")
      ? `סכום זיכוי: ₪${Number(creditAmount)}`
      : (COUPONS.find(c=>c.key===couponType)?.label || couponType);

    const payload = {
      phone: ph,
      name: name.trim(), // להצגה בלבד
      coupon_type: couponText,
      reason: reason?.trim() || null,
      created_by: createdBy?.trim() || null,
      redeemed: false,
      redeemed_at: null,
      redeemed_by: null,
      created_at: new Date(),
      updated_at: new Date()
    };

    setLoading(true);
    const { error } = await supabase.from("comp.customers_coupons").insert(payload);
    setLoading(false);
    if(error) return alert("שגיאה בשמירת פיצוי: "+error.message);

    // ניקוי חלקי; שומר טלפון+שם להמשך הזנה
    setReason("");
    setCreatedBy("");
    setCouponType("");
    setCreditAmount("");
    setQueryPhone(ph); // רענון כרטיס
  }

  async function redeemCoupon(rec){
    const approver = prompt("שם מאשר המימוש:");
    if(!approver) return;
    const { error } = await supabase
      .from("comp.customers_coupons")
      .update({ redeemed: true, redeemed_at: new Date(), redeemed_by: approver })
      .eq("id", rec.id);
    if(error) return alert("שגיאה במימוש: "+error.message);
    fetchByPhone(rec.phone);
  }

  // Import: תאריך, טלפון, שם, פיצוי, הערות
  function importFromXlsx(ev){
    const file = ev.target.files?.[0]; if(!file) return;
    setImporting(true);
    setTimeout(async()=>{
      try{
        const ab = await file.arrayBuffer();
        const wb = XLSX.read(ab,{type:"array"});
        const ws = wb.Sheets[wb.SheetNames[0]];
        const json = XLSX.utils.sheet_to_json(ws,{defval:""});
        const rows = json.map(r=>({
          phone: normalizePhone(r["טלפון"]||r["מספר טלפון"]||r["phone"])||"",
          name: (r["שם"]||r["שם לקוח"]||r["name"]||"").toString().trim(),
          compText: (r["פיצוי"]||r["זיכוי"]||r["compensation"]||"").toString().trim(),
          notes: (r["הערות"]||r["notes"]||"").toString().trim(),
        })).filter(x=>x.phone);
        if(!rows.length) throw new Error("לא נמצאו שורות תקינות לייבוא");

        const comps = rows.map(r=>({
          phone: r.phone,
          name: r.name || null,
          coupon_type: r.compText || "פיצוי (טקסט חופשי)",
          reason: r.notes || null,
          created_by: null,
          redeemed: false,
          redeemed_at: null,
          redeemed_by: null,
          created_at: new Date(),
          updated_at: new Date()
        }));
        const { error } = await supabase.from("comp.customers_coupons").insert(comps);
        if(error) throw error;
        alert(`יובאו ${comps.length} רשומות`);
        if(rows[0]?.phone) setQueryPhone(rows[0].phone);
      }catch(err){
        alert("שגיאה בייבוא: "+(err?.message||err));
      }finally{
        setImporting(false);
        if(fileRef.current) fileRef.current.value = "";
      }
    }, 50);
  }

  const lastName = useMemo(()=> rows.find(r=>r.name)?.name || "", [rows]);

  return (
    <div className="min-h-screen bg-white text-black p-4 sm:p-8 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl sm:text-3xl font-bold">ניהול פיצויים ללקוחות</h1>
        <div className="flex items-center gap-2">
          <Button onClick={()=>setRtl(!rtl)} title="החלף כיוון">{rtl?"RTL":"LTR"}</Button>
          <Button onClick={()=>fileRef.current?.click()} className="bg-black text-white" disabled={importing}>{importing?"מייבא...":"ייבוא אקסל/CSV"}</Button>
          <input type="file" accept=".xlsx,.xls,.csv" ref={fileRef} onChange={importFromXlsx} className="hidden"/>
        </div>
      </div>

      {/* Search */}
      <div className="grid sm:grid-cols-3 gap-4 mb-6">
        <div className="sm:col-span-2">
          <Label>איתור לפי מספר טלפון (ספרות בלבד)</Label>
          <Input inputMode="numeric" placeholder="לדוגמה: 0521234567" value={queryPhone} onChange={(e)=>setQueryPhone(normalizePhone(e.target.value))}/>
        </div>
        <div className="flex items-end">
          <Button onClick={()=>fetchByPhone(queryPhone)} className="w-full">חיפוש</Button>
        </div>
      </div>

      {/* Add Compensation */}
      <form onSubmit={addCoupon} className="grid md:grid-cols-2 gap-6 mb-10 bg-gray-50 rounded-2xl p-4 sm:p-6 border">
        <div>
          <Label>מספר טלפון (מזהה ייחודי)</Label>
          <Input required inputMode="numeric" value={phone} onChange={(e)=>setPhone(normalizePhone(e.target.value))} placeholder="05XXXXXXXX"/>
          {!phoneValid && phone && (<p className="text-xs text-red-600 mt-1">נדרש 10 ספרות שמתחיל ב-05</p>)}
        </div>
        <div>
          <Label>שם לקוח</Label>
          <Input required value={name} onChange={(e)=>setName(e.target.value)} />
        </div>
        <div className="md:col-span-2">
          <Label>קופון פיצוי</Label>
          <div className="flex gap-2 flex-wrap">
            <Button type="button" onClick={openCouponModal} className={`${couponType?"bg-black text-white":""}`}>{couponType? (COUPONS.find(c=>c.key===couponType)?.label || `סכום זיכוי: ₪${creditAmount||0}`) : "בחר קופון"}</Button>
            {couponType === "CREDIT" && (
              <div className="max-w-xs">
                <Label>סכום זיכוי (₪)</Label>
                <Input inputMode="decimal" value={creditAmount} onChange={(e)=>setCreditAmount(e.target.value.replace(/[^\d.]/g,''))} placeholder="לדוגמה: 30"/>
              </div>
            )}
          </div>
        </div>
        <div>
          <Label>סיבת הפיצוי</Label>
          <Textarea rows={2} value={reason} onChange={(e)=>setReason(e.target.value)} placeholder="לדוגמה: איחור שליח / טעות בהזמנה"/>
        </div>
        <div>
          <Label>ע"י מי הוזן הפיצוי</Label>
          <Input value={createdBy} onChange={(e)=>setCreatedBy(e.target.value)} placeholder="לדוגמה: רן / דלפק"/>
        </div>
        <div className="md:col-span-2 flex gap-3">
          <Button type="submit" className="bg-black text-white" disabled={loading || !phoneValid || !couponType}>שמור פיצוי</Button>
          <Button type="button" onClick={()=>{ setReason(""); setCreatedBy(""); setCouponType(""); setCreditAmount(""); }}>נקה שדות</Button>
        </div>
      </form>

      {/* Customer Card */}
      <div className="bg-gray-50 rounded-2xl p-4 sm:p-6 border">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold">כרטיס לקוח {queryPhone && `• ${queryPhone}`}{lastName?` • ${lastName}`:""}</h2>
          {loading && <span className="text-sm opacity-70">טוען...</span>}
        </div>
        {rows.length === 0 ? (
          <p className="opacity-70">אין פיצויים להצגה</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="bg-white">
                  <th className="text-right p-2 border-b">קופון</th>
                  <th className="text-right p-2 border-b">סיבה</th>
                  <th className="text-right p-2 border-b">הוזן ע"י</th>
                  <th className="text-right p-2 border-b">סטטוס</th>
                  <th className="text-right p-2 border-b">פעולה</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r)=> (
                  <tr key={r.id} className="odd:bg-white even:bg-gray-100">
                    <td className="p-2 border-b">{r.coupon_type}</td>
                    <td className="p-2 border-b">{r.reason || "—"}</td>
                    <td className="p-2 border-b">{r.created_by || "—"}</td>
                    <td className="p-2 border-b">{r.redeemed ? `מומש ב-${new Date(r.redeemed_at).toLocaleString()} ע"י ${r.redeemed_by}` : "פתוח"}</td>
                    <td className="p-2 border-b whitespace-nowrap">
                      {!r.redeemed && (
                        <Button onClick={()=>redeemCoupon(r)} className="bg-green-600 text-white">ממש</Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Coupon Modal */}
      <Modal open={couponModalOpen} onClose={()=>setCouponModalOpen(false)} title="בחר קופון פיצוי">
        <div className="grid grid-cols-1 gap-2">
          {COUPONS.map(opt => (
            <Button key={opt.key} onClick={()=>chooseCoupon(opt.key)} className={`text-right ${couponType===opt.key?"bg-black text-white":""}`}>{opt.label}</Button>
          ))}
        </div>
        {couponType === "CREDIT" && (
          <div className="mt-4 max-w-xs">
            <Label>סכום זיכוי (₪)</Label>
            <Input inputMode="decimal" value={creditAmount} onChange={(e)=>setCreditAmount(e.target.value.replace(/[^\d.]/g,''))} placeholder="לדוגמה: 30"/>
          </div>
        )}
        <div className="mt-3 text-right">
          <Button className="bg-black text-white" onClick={()=>setCouponModalOpen(false)}>אישור</Button>
        </div>
      </Modal>

      <footer className="text-xs opacity-60 mt-8">טלפון הוא מזהה יחיד. השם אינו משמש לזיהוי, רק להצגה. ייבוא אקסל מוסיף רשומות לפי טלפון.</footer>
    </div>
  );
}
