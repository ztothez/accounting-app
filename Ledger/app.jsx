/* Ledger app — main component */
const { useState, useEffect, useMemo, useRef } = React;

const STORAGE_KEY = 'ledger.v1';
const THEME_KEY = 'ledger.theme';

const LEDGER_URL = 'https://ledger.local/';
const DEBTS_URL = 'https://debts.local/';
const CAREER_URL = 'https://career.local/';
const VIDEOS_URL = 'https://videos.local/';
const PDF_URL = 'https://pdf.local/';

// init theme before mount — design system default: dark OLED
(function initTheme(){
  const saved = localStorage.getItem(THEME_KEY);
  const theme = saved || 'dark';
  document.documentElement.setAttribute('data-theme', theme);
})();

// ---------- helpers ----------
const fmt = (n) => {
  if (n === null || n === undefined || isNaN(n)) return '—';
  return n.toLocaleString('fi-FI', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};
const num = (v) => {
  if (typeof v === 'number') return v;
  if (!v) return 0;
  let cleaned = String(v).trim().replace(/\s/g, '');
  const lastComma = cleaned.lastIndexOf(',');
  const lastDot = cleaned.lastIndexOf('.');
  if (lastComma !== -1 && lastDot !== -1) {
    const decimalSeparator = lastComma > lastDot ? ',' : '.';
    const thousandsSeparator = decimalSeparator === ',' ? '.' : ',';
    cleaned = cleaned
      .replaceAll(thousandsSeparator, '')
      .replace(decimalSeparator, '.');
  } else {
    cleaned = cleaned.replace(',', '.');
  }
  const n = parseFloat(cleaned);
  return isNaN(n) ? 0 : n;
};
const uid = () => Math.random().toString(36).slice(2, 10);

// parse "April 2026" / "Kesäkuu 2025" etc into sortable key
const MONTH_ORDER = {
  'Tammikuu':1,'January':1,'Januarry':1,
  'Helmikuu':2,'February':2,
  'Maaliskuu':3,'March':3,
  'Huhtikuu':4,'April':4,
  'Toukokuu':5,'May':5,
  'Kesäkuu':6,'Keskäkuu':6,'June':6,
  'Heinäkuu':7,'July':7,
  'Elokuu':8,'August':8,
  'Syyskuu':9,'September':9,
  'Lokakuu':10,'October':10,
  'Marraskuu':11,'November':11,
  'Joulukuu':12,'December':12,
};
function parseMonthLabel(label) {
  const m = label.match(/^(\S+)\s+(\d{4})$/);
  if (!m) return { mn: 0, year: 0 };
  return { mn: MONTH_ORDER[m[1]] || 0, year: parseInt(m[2]) };
}
function sortKey(label) {
  const { mn, year } = parseMonthLabel(label);
  return year * 100 + mn;
}
function nextMonthLabel(currentLabel) {
  const { mn, year } = parseMonthLabel(currentLabel);
  if (!mn) return '';
  let nm = mn + 1, ny = year;
  if (nm > 12) { nm = 1; ny++; }
  const names = ['','January','February','March','April','May','June','July','August','September','October','November','December'];
  return `${names[nm]} ${ny}`;
}
function retargetDateToMonth(due, monthLabel) {
  if (!due) return due;
  const match = String(due).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const { mn, year } = parseMonthLabel(monthLabel);
  if (!match || !mn || !year) return due;

  const originalDay = parseInt(match[3], 10);
  const lastDay = new Date(year, mn, 0).getDate();
  const day = Math.min(originalDay, lastDay);
  return `${year}-${String(mn).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function dateClass(due) {
  if (!due) return '';
  const today = new Date(); today.setHours(0,0,0,0);
  const d = new Date(due);
  if (isNaN(d.getTime())) return '';
  d.setHours(0,0,0,0);
  if (d < today) return 'overdue';
  if (d.getTime() === today.getTime()) return 'today';
  return '';
}
function shortDate(due) {
  if (!due) return '';
  const d = new Date(due);
  if (isNaN(d.getTime())) return due;
  return d.toLocaleDateString('en-GB', { day:'2-digit', month:'short' });
}

// ---------- icon ----------
const Icon = {
  Check: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>,
  X: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>,
  Plus: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>,
  Trash: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/></svg>,
  Sun: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/></svg>,
  Moon: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>,
};

function useTheme() {
  const [theme, setTheme] = useState(() => document.documentElement.getAttribute('data-theme') || 'light');
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem(THEME_KEY, theme);
  }, [theme]);
  return [theme, () => setTheme(t => t === 'dark' ? 'light' : 'dark')];
}

// ---------- store ----------
function loadStore() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) {}
  const seed = window.SEED_MONTHS || [];
  const months = seed.map((m) => ({
    id: uid(),
    label: m.label,
    income: (m.income || []).map(r => ({ id: uid(), ...r, custom: {} })),
    expenses: (m.expenses || []).map(r => ({ id: uid(), ...r, custom: {} })),
    customCols: { income: [], expenses: [] },
    saldo: 0, // carry-over balance
  }));
  months.sort((a,b) => sortKey(a.label) - sortKey(b.label));
  return { months, activeId: months[months.length - 1]?.id || null };
}
function saveStore(s) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
}

// ---------- App ----------
function App() {
  const [store, setStore] = useState(loadStore);
  useEffect(() => { saveStore(store); }, [store]);

  const [showNewMonth, setShowNewMonth] = useState(false);

  const update = (fn) => setStore(s => fn({ ...s, months: s.months.slice() }));

  const sortedMonths = useMemo(() =>
    store.months.slice().sort((a,b) => sortKey(a.label) - sortKey(b.label)),
    [store.months]
  );

  const activeMonth = store.months.find(m => m.id === store.activeId) || store.months[store.months.length - 1];

  const setActive = (id) => setStore(s => ({ ...s, activeId: id }));

  const updateMonth = (id, fn) => {
    setStore(s => ({
      ...s,
      months: s.months.map(m => m.id === id ? fn(m) : m)
    }));
  };

  const addMonth = ({ label, copyFromId, copyIncome, copyExpenses, resetPaid }) => {
    const newM = {
      id: uid(),
      label,
      income: [],
      expenses: [],
      customCols: { income: [], expenses: [] },
      saldo: 0,
    };
    if (copyFromId) {
      const src = store.months.find(m => m.id === copyFromId);
      if (src) {
        newM.customCols = JSON.parse(JSON.stringify(src.customCols));
        if (copyIncome) {
          newM.income = src.income
            .filter(e => e.source || e.date)
            .map(r => ({
              ...r,
              id: uid(),
              custom: { ...(r.custom || {}) },
            }));
        }
        if (copyExpenses) {
          newM.expenses = src.expenses
            .filter(e => e.provider || e.description)
            .map(r => ({
              ...r, id: uid(),
              paid: resetPaid ? false : r.paid,
              due: retargetDateToMonth(r.due, label),
              custom: { ...(r.custom || {}) },
            }));
        }
      }
    }
    setStore(s => ({
      ...s,
      months: [...s.months, newM],
      activeId: newM.id,
    }));
    setShowNewMonth(false);
  };

  const deleteMonth = (id) => {
    if (!confirm('Delete this month? This cannot be undone.')) return;
    setStore(s => {
      const nm = s.months.filter(m => m.id !== id);
      const sorted = nm.slice().sort((a,b) => sortKey(a.label) - sortKey(b.label));
      return { ...s, months: nm, activeId: sorted[sorted.length-1]?.id || null };
    });
  };

  const renameMonth = (id, newLabel) => {
    updateMonth(id, m => ({ ...m, label: newLabel }));
  };

  const exportJson = () => {
    const blob = new Blob([JSON.stringify(store, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `ledger-${new Date().toISOString().slice(0,10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const importJson = () => {
    const input = document.createElement('input');
    input.type = 'file'; input.accept = '.json,application/json';
    input.onchange = async (e) => {
      const f = e.target.files[0]; if (!f) return;
      const text = await f.text();
      try {
        const data = JSON.parse(text);
        if (data.months && Array.isArray(data.months)) {
          if (confirm(`Replace your data with ${data.months.length} months from this file?`)) {
            setStore(data);
          }
        }
      } catch (err) { alert('Invalid file'); }
    };
    input.click();
  };

  const resetData = () => {
    if (!confirm('Reset this browser to an empty baseline? Your local edits will be lost.')) return;
    localStorage.removeItem(STORAGE_KEY);
    setStore(loadStore());
  };

  if (!activeMonth) {
    return (
      <div className="app">
        <Masthead />
        <SubNav active="career" />
        <div className="empty" style={{padding:60}}>
          No months yet.
          <div style={{marginTop:20}}>
            <button className="btn-primary" onClick={() => setShowNewMonth(true)}>+ Create your first month</button>
          </div>
        </div>
        {showNewMonth && (
          <NewMonthModal months={store.months} onCreate={addMonth} onClose={() => setShowNewMonth(false)} />
        )}
      </div>
    );
  }

  return (
    <div className="app">
      <Masthead activeMonth={activeMonth} />
      <SubNav active="ledger" />
      <MonthTabs
        months={sortedMonths}
        activeId={activeMonth.id}
        setActive={setActive}
        onAdd={() => setShowNewMonth(true)}
      />
      <SummaryBand month={activeMonth} updateMonth={(fn) => updateMonth(activeMonth.id, fn)} />
      <Section
        kind="income"
        month={activeMonth}
        updateMonth={(fn) => updateMonth(activeMonth.id, fn)}
      />
      <Section
        kind="expenses"
        month={activeMonth}
        updateMonth={(fn) => updateMonth(activeMonth.id, fn)}
      />
      <footer className="footnote">
        <div>LEDGER · {activeMonth.label} · {sortedMonths.length} {sortedMonths.length===1?'month':'months'} on file</div>
        <div className="right-actions">
          <a href={DEBTS_URL}>Debts</a>
          <a href={CAREER_URL}>Career</a>
          <button onClick={() => renamePrompt(activeMonth, renameMonth)}>Rename month</button>
          <button onClick={() => deleteMonth(activeMonth.id)}>Delete month</button>
          <button onClick={exportJson}>Export</button>
          <button onClick={importJson}>Import</button>
          <button onClick={resetData}>Reset</button>
        </div>
      </footer>
      {showNewMonth && (
        <NewMonthModal
          months={sortedMonths}
          fromId={activeMonth.id}
          onCreate={addMonth}
          onClose={() => setShowNewMonth(false)}
        />
      )}
    </div>
  );
}

function renamePrompt(month, renameMonth) {
  const newName = prompt('Rename month (e.g. "May 2026"):', month.label);
  if (newName && newName.trim()) renameMonth(month.id, newName.trim());
}

// ---------- Masthead ----------
function Masthead({ activeMonth }) {
  const [theme, toggleTheme] = useTheme();
  const today = new Date().toLocaleDateString('en-GB', { weekday:'short', day:'2-digit', month:'long', year:'numeric' });
  return (
    <header className="masthead">
      <div className="brand">
        <div className="mark">Le<em>d</em>ger</div>
        <div className="sub">Personal Monthly Reckoning</div>
      </div>
      <div className="meta">
        <div style={{display:'flex', alignItems:'center', gap:14, justifyContent:'flex-end'}}>
          <button className="theme-toggle" type="button" onClick={toggleTheme} title={theme==='dark'?'Switch to light':'Switch to dark'} aria-label="Toggle theme">
            {theme === 'dark' ? <Icon.Sun /> : <Icon.Moon />}
          </button>
          <span>Issue</span>
        </div>
        <span className="num">{activeMonth ? activeMonth.label : '—'}</span>
        <span style={{display:'block', marginTop:6, letterSpacing:'0.12em'}}>{today}</span>
      </div>
    </header>
  );
}

function SubNav({ active }) {
  return (
    <nav className="sub-nav" aria-label="Personal apps">
      <a href={LEDGER_URL} className={'sub-nav-link' + (active === 'ledger' ? ' active' : '')}>Ledger</a>
      <a href={DEBTS_URL} className={'sub-nav-link' + (active === 'debts' ? ' active' : '')}>Debts</a>
      <a href={CAREER_URL} className={'sub-nav-link' + (active === 'career' ? ' active' : '')}>Career</a>
      <a href={VIDEOS_URL} className={'sub-nav-link' + (active === 'videos' ? ' active' : '')}>Videos</a>
      <a href={PDF_URL} className={'sub-nav-link' + (active === 'pdf' ? ' active' : '')}>PDF</a>
    </nav>
  );
}

// ---------- Month tabs ----------
function MonthTabs({ months, activeId, setActive, onAdd }) {
  return (
    <div className="months">
      {months.map(m => {
        const { mn, year } = parseMonthLabel(m.label);
        const totalExp = m.expenses.reduce((s, r) => s + num(r.amount), 0);
        const totalInc = m.income.reduce((s, r) => s + num(r.amount), 0);
        const diff = totalInc - totalExp;
        return (
          <button
            key={m.id}
            className={'month-tab' + (m.id === activeId ? ' active' : '')}
            onClick={() => setActive(m.id)}
            title={`${m.label} — ${diff >= 0 ? '+' : ''}${fmt(diff)} €`}
          >
            {m.label.split(' ')[0]}
            <span className="tab-year">{year || ''}</span>
          </button>
        );
      })}
      <button className="add-month-btn" onClick={onAdd} title="Add new month">+ New month</button>
    </div>
  );
}

// ---------- Summary band ----------
function SummaryBand({ month, updateMonth }) {
  const totalInc = month.income.reduce((s,r) => s + num(r.amount), 0);
  const totalExp = month.expenses.reduce((s,r) => s + num(r.amount), 0);
  const diff = totalInc - totalExp;
  const paid = month.expenses.filter(r => r.paid).reduce((s,r) => s + num(r.amount), 0);
  const unpaid = totalExp - paid;
  const remaining = (num(month.saldo) + totalInc) - paid; // money currently in pocket if treated cash-basis

  return (
    <div className="summary">
      <div className="sum-cell">
        <div className="sum-label">Income</div>
        <div className="sum-value pos">{fmt(totalInc)} <span style={{fontSize:14, color:'var(--ink-3)'}}>€</span></div>
        <div className="sum-foot">{month.income.filter(r=>num(r.amount)>0).length} sources</div>
      </div>
      <div className="sum-cell">
        <div className="sum-label">Expenses</div>
        <div className="sum-value neg">{fmt(totalExp)} <span style={{fontSize:14, color:'var(--ink-3)'}}>€</span></div>
        <div className="sum-foot">{month.expenses.filter(r=>num(r.amount)>0).length} bills</div>
      </div>
      <div className={'sum-cell ' + (diff >= 0 ? 'positive' : 'accent')}>
        <div className="sum-label">Net (balance)</div>
        <div className={'sum-value ' + (diff >= 0 ? 'pos' : 'neg')}>{diff >= 0 ? '+' : ''}{fmt(diff)}</div>
        <div className="sum-foot">{diff >= 0 ? 'in the black' : 'short by ' + fmt(Math.abs(diff)) + ' €'}</div>
      </div>
      <div className="sum-cell">
        <div className="sum-label">Paid · Unpaid</div>
        <div className="sum-value" style={{fontSize:24}}>
          <span style={{color:'var(--paid)'}}>{fmt(paid)}</span>
          <span style={{color:'var(--ink-3)', margin:'0 8px', fontSize:18}}>·</span>
          <span style={{color:'var(--accent)'}}>{fmt(unpaid)}</span>
        </div>
        <div className="sum-foot">€ paid out vs. still owed</div>
      </div>
      <div className="sum-cell">
        <div className="sum-label">Carry-over saldo</div>
        <input
          className="cell-input num"
          style={{padding:0, fontSize:32, fontFamily:'var(--serif)', fontWeight:400, letterSpacing:'-0.01em', color:'var(--ink)'}}
          type="text"
          inputMode="decimal"
          step="0.01"
          value={month.saldo || ''}
          placeholder="0.00"
          onChange={e => updateMonth(m => ({ ...m, saldo: e.target.value }))}
        />
        <div className="sum-foot">opening balance from last month</div>
      </div>
    </div>
  );
}

// ---------- Section (Income or Expenses) ----------
function Section({ kind, month, updateMonth }) {
  const isIncome = kind === 'income';
  const rows = isIncome ? month.income : month.expenses;
  const customCols = month.customCols[kind] || [];

  const total = rows.reduce((s,r) => s + num(r.amount), 0);

  const updateRows = (fn) => {
    updateMonth(m => ({
      ...m,
      [kind]: fn(m[kind]),
    }));
  };

  const addRow = () => {
    const blank = isIncome
      ? { id: uid(), source: '', amount: 0, date: '', custom: {} }
      : { id: uid(), provider: '', description: '', type: 'Lasku', amount: 0, paid: false, due: '', custom: {} };
    updateRows(rs => [...rs, blank]);
  };
  const setRow = (id, patch) => updateRows(rs => rs.map(r => r.id === id ? { ...r, ...patch } : r));
  const setCustom = (id, key, val) => updateRows(rs => rs.map(r => r.id === id ? { ...r, custom: { ...(r.custom||{}), [key]: val } } : r));
  const delRow = (id) => updateRows(rs => rs.filter(r => r.id !== id));

  const addCol = () => {
    const name = prompt('New column name:');
    if (!name) return;
    const type = confirm('Make this a numeric column? (OK = numeric, Cancel = text)') ? 'num' : 'text';
    updateMonth(m => ({
      ...m,
      customCols: { ...m.customCols, [kind]: [...(m.customCols[kind]||[]), { id: uid(), name, type }] }
    }));
  };
  const renameCol = (cid, newName) => {
    updateMonth(m => ({
      ...m,
      customCols: { ...m.customCols, [kind]: (m.customCols[kind]||[]).map(c => c.id===cid ? { ...c, name: newName } : c) }
    }));
  };
  const delCol = (cid) => {
    if (!confirm('Delete this column for this month?')) return;
    updateMonth(m => ({
      ...m,
      customCols: { ...m.customCols, [kind]: (m.customCols[kind]||[]).filter(c => c.id !== cid) },
      [kind]: m[kind].map(r => {
        const { [cid]: _removed, ...custom } = r.custom || {};
        return { ...r, custom };
      }),
    }));
  };

  return (
    <div className="section">
      <div className="section-head">
        <div>
          <h2>{isIncome ? 'Income' : 'Expenses'}</h2>
          <div className="subtitle">{isIncome ? 'Tulot · what comes in' : 'Menot · what goes out'}</div>
        </div>
        <div className="right">
          <span style={{textTransform:'uppercase', letterSpacing:'0.15em', fontSize:10, color:'var(--ink-3)'}}>Total</span>
          <span className="total-strong">{fmt(total)} €</span>
        </div>
      </div>
      <div className="col-toolbar">
        <span>{customCols.length === 0 ? 'No custom columns' : `${customCols.length} custom column${customCols.length===1?'':'s'}`}</span>
        <button className="btn-ghost" onClick={addCol}>+ Add column</button>
      </div>

      {isIncome
        ? <IncomeTable rows={rows} customCols={customCols} setRow={setRow} setCustom={setCustom} delRow={delRow} renameCol={renameCol} delCol={delCol} total={total} />
        : <ExpenseTable rows={rows} customCols={customCols} setRow={setRow} setCustom={setCustom} delRow={delRow} renameCol={renameCol} delCol={delCol} total={total} />
      }

      <button className="add-row" onClick={addRow}>+ Add {isIncome ? 'income' : 'expense'} row</button>
    </div>
  );
}

// ---------- Income Table ----------
function IncomeTable({ rows, customCols, setRow, setCustom, delRow, renameCol, delCol, total }) {
  return (
    <table className="ledger">
      <thead>
        <tr>
          <th style={{width:36}}></th>
          <th>Source</th>
          <th>Date / note</th>
          {customCols.map(c => (
            <th key={c.id} className={c.type==='num'?'num':''}>
              <ColHeaderEdit col={c} renameCol={renameCol} delCol={delCol} />
            </th>
          ))}
          <th className="num" style={{width:140}}>Amount (€)</th>
        </tr>
      </thead>
      <tbody>
        {rows.length === 0 && (
          <tr><td colSpan={4 + customCols.length} className="empty">No income recorded yet.</td></tr>
        )}
        {rows.map((r, idx) => (
          <tr key={r.id}>
            <td className="row-actions">
              <span style={{fontFamily:'var(--mono)', fontSize:10, color:'var(--ink-3)', minWidth:18, textAlign:'center'}}>{idx+1}</span>
              <button onClick={() => delRow(r.id)} title="Delete row"><Icon.Trash /></button>
            </td>
            <td><input className="cell-input" value={r.source||''} placeholder="e.g. Salary" onChange={e => setRow(r.id, { source: e.target.value })} /></td>
            <td><input className="cell-input muted" value={r.date||''} placeholder="—" onChange={e => setRow(r.id, { date: e.target.value })} /></td>
            {customCols.map(c => (
              <td key={c.id}>
                <input className={'cell-input' + (c.type==='num'?' num':'')}
                  type="text"
                  inputMode={c.type==='num' ? 'decimal' : undefined}
                  step="0.01"
                  value={(r.custom?.[c.id]) ?? ''}
                  onChange={e => setCustom(r.id, c.id, e.target.value)} />
              </td>
            ))}
            <td><input className="cell-input num" type="text" inputMode="decimal" step="0.01" value={r.amount || ''} placeholder="0.00" onChange={e => setRow(r.id, { amount: e.target.value })} /></td>
          </tr>
        ))}
      </tbody>
      <tfoot>
        <tr>
          <td colSpan={3 + customCols.length} className="label-cell">Total income</td>
          <td className="num">{fmt(total)} €</td>
        </tr>
      </tfoot>
    </table>
  );
}

// ---------- Expense Table ----------
function ExpenseTable({ rows, customCols, setRow, setCustom, delRow, renameCol, delCol, total }) {
  const cycleType = (cur) => {
    const order = ['Lasku', 'Tilaus', 'Osamaksu', 'Muu'];
    const i = order.indexOf(cur);
    return order[(i+1) % order.length];
  };
  return (
    <table className="ledger">
      <thead>
        <tr>
          <th style={{width:36}}></th>
          <th>Provider</th>
          <th>Description</th>
          <th>Type</th>
          <th>Due</th>
          {customCols.map(c => (
            <th key={c.id} className={c.type==='num'?'num':''}>
              <ColHeaderEdit col={c} renameCol={renameCol} delCol={delCol} />
            </th>
          ))}
          <th className="num" style={{width:140}}>Amount (€)</th>
          <th className="center" style={{width:80}}>Paid</th>
        </tr>
      </thead>
      <tbody>
        {rows.length === 0 && (
          <tr><td colSpan={7 + customCols.length} className="empty">No bills yet — click “+ Add expense row” below.</td></tr>
        )}
        {rows.map((r, idx) => {
          const tCls = (r.type||'lasku').toLowerCase();
          return (
            <tr key={r.id} className={r.paid ? 'paid' : ''}>
              <td className="row-actions">
                <span style={{fontFamily:'var(--mono)', fontSize:10, color:'var(--ink-3)', minWidth:18, textAlign:'center'}}>{idx+1}</span>
                <button onClick={() => delRow(r.id)} title="Delete row"><Icon.Trash /></button>
              </td>
              <td><input className="cell-input" value={r.provider||''} placeholder="e.g. Fortum" onChange={e => setRow(r.id, { provider: e.target.value })} /></td>
              <td><input className="cell-input muted" value={r.description||''} placeholder="—" onChange={e => setRow(r.id, { description: e.target.value })} /></td>
              <td>
                <span className={'type-pill ' + tCls}
                  onClick={() => setRow(r.id, { type: cycleType(r.type||'Lasku') })}
                  title="Click to cycle type"
                  style={{margin:'0 14px'}}
                >{r.type || 'Lasku'}</span>
              </td>
              <td className={'due-cell ' + dateClass(r.due)}>
                <input type="date" value={r.due||''} onChange={e => setRow(r.id, { due: e.target.value })} />
              </td>
              {customCols.map(c => (
                <td key={c.id}>
                  <input className={'cell-input' + (c.type==='num'?' num':'')}
                    type="text"
                    inputMode={c.type==='num' ? 'decimal' : undefined}
                    step="0.01"
                    value={(r.custom?.[c.id]) ?? ''}
                    onChange={e => setCustom(r.id, c.id, e.target.value)} />
                </td>
              ))}
              <td><input className="cell-input num" type="text" inputMode="decimal" step="0.01" value={r.amount || ''} placeholder="0.00" onChange={e => setRow(r.id, { amount: e.target.value })} /></td>
              <td className="check-cell">
                <div
                  className={'check ' + (r.paid ? 'on' : '')}
                  onClick={() => setRow(r.id, { paid: !r.paid })}
                  role="checkbox"
                  aria-checked={r.paid}
                  tabIndex={0}
                  onKeyDown={e => (e.key === ' ' || e.key === 'Enter') && setRow(r.id, { paid: !r.paid })}
                >
                  {r.paid && <Icon.Check />}
                </div>
              </td>
            </tr>
          );
        })}
      </tbody>
      <tfoot>
        <tr>
          <td colSpan={6 + customCols.length} className="label-cell">Total expenses</td>
          <td className="num">{fmt(total)} €</td>
          <td></td>
        </tr>
      </tfoot>
    </table>
  );
}

function ColHeaderEdit({ col, renameCol, delCol }) {
  return (
    <span className="col-header-edit">
      <input value={col.name} onChange={e => renameCol(col.id, e.target.value)} />
      <button className="x" onClick={() => delCol(col.id)} title="Delete column"><Icon.X /></button>
    </span>
  );
}

// ---------- New month modal ----------
function NewMonthModal({ months, fromId, onCreate, onClose }) {
  const sorted = months.slice().sort((a,b) => sortKey(a.label) - sortKey(b.label));
  const last = sorted[sorted.length - 1];
  const suggested = last ? nextMonthLabel(last.label) : 'May 2026';
  const [label, setLabel] = useState(suggested);
  const [copyFromId, setCopyFromId] = useState(fromId || (last?.id || ''));
  const [copyIncome, setCopyIncome] = useState(true);
  const [copyExpenses, setCopyExpenses] = useState(true);
  const [resetPaid, setResetPaid] = useState(true);

  const handleCreate = () => {
    if (!label.trim()) return;
    onCreate({ label: label.trim(), copyFromId, copyIncome, copyExpenses, resetPaid });
  };

  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <h3>New month</h3>
        <label>Label</label>
        <input type="text" value={label} onChange={e => setLabel(e.target.value)} placeholder="May 2026" autoFocus />

        <label>Copy structure from</label>
        <select value={copyFromId} onChange={e => setCopyFromId(e.target.value)}>
          <option value="">— Start blank —</option>
          {sorted.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
        </select>

        {copyFromId && (
          <>
            <div className="checkbox-row">
              <input type="checkbox" id="copy-inc" checked={copyIncome} onChange={e => setCopyIncome(e.target.checked)} />
              <label htmlFor="copy-inc" style={{margin:0, textTransform:'none', letterSpacing:'normal', fontSize:12, color:'var(--ink-2)'}}>Copy income rows (source, date/note, amounts, custom columns)</label>
            </div>
            <div className="checkbox-row">
              <input type="checkbox" id="copy-exp" checked={copyExpenses} onChange={e => setCopyExpenses(e.target.checked)} />
              <label htmlFor="copy-exp" style={{margin:0, textTransform:'none', letterSpacing:'normal', fontSize:12, color:'var(--ink-2)'}}>Copy recurring expense rows (provider, description, due day)</label>
            </div>
            <div className="checkbox-row">
              <input type="checkbox" id="reset-paid" checked={resetPaid} onChange={e => setResetPaid(e.target.checked)} />
              <label htmlFor="reset-paid" style={{margin:0, textTransform:'none', letterSpacing:'normal', fontSize:12, color:'var(--ink-2)'}}>Reset all "paid" checkboxes</label>
            </div>
          </>
        )}

        <div className="modal-actions">
          <button className="btn-link" onClick={onClose}>Cancel</button>
          <button className="btn-primary" onClick={handleCreate}>Create</button>
        </div>
      </div>
    </div>
  );
}

// ---------- mount ----------
const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<App />);
