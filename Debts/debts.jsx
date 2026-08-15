/* Debts app — shares styles.css with Ledger */
const { useState, useEffect, useMemo } = React;

const STORAGE_KEY = 'debts.v1';
const THEME_KEY = 'ledger.theme';

(function initTheme(){
  const saved = localStorage.getItem(THEME_KEY);
  document.documentElement.setAttribute('data-theme', saved || 'dark');
})();

const fmt = (n) => {
  if (n === null || n === undefined || isNaN(n)) return '—';
  return n.toLocaleString('fi-FI', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};
const num = (v) => {
  if (typeof v === 'number') return v;
  if (!v) return 0;
  const raw = String(v).trim();
  if (raw.startsWith('=')) return calculateFormula(raw.slice(1));
  return parseNumber(raw);
};
const parseNumber = (v) => {
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
const calculateFormula = (expression) => {
  const normalized = expression.replace(/\s/g, '').replace(/,/g, '.');
  if (!normalized || /[^0-9+\-*/().]/.test(normalized)) return 0;

  let index = 0;

  const parseExpression = () => {
    let value = parseTerm();
    while (normalized[index] === '+' || normalized[index] === '-') {
      const op = normalized[index++];
      const next = parseTerm();
      value = op === '+' ? value + next : value - next;
    }
    return value;
  };

  const parseTerm = () => {
    let value = parseFactor();
    while (normalized[index] === '*' || normalized[index] === '/') {
      const op = normalized[index++];
      const next = parseFactor();
      value = op === '*' ? value * next : value / next;
    }
    return value;
  };

  const parseFactor = () => {
    if (normalized[index] === '+') {
      index++;
      return parseFactor();
    }
    if (normalized[index] === '-') {
      index++;
      return -parseFactor();
    }
    if (normalized[index] === '(') {
      index++;
      const value = parseExpression();
      if (normalized[index] !== ')') return Number.NaN;
      index++;
      return value;
    }

    const start = index;
    while (/[0-9.]/.test(normalized[index])) index++;
    return parseFloat(normalized.slice(start, index));
  };

  const result = parseExpression();
  return index === normalized.length && Number.isFinite(result) ? result : 0;
};
const uid = () => Math.random().toString(36).slice(2, 10);
const isDraftDebt = (d) =>
  num(d.total) === 0 &&
  num(d.paid) === 0 &&
  num(d.monthly) === 0;
const isOpenDebt = (d) => (num(d.total) - num(d.paid)) > 0.001 || isDraftDebt(d);
const isPaidDebt = (d) => num(d.total) > 0 && (num(d.total) - num(d.paid)) <= 0.001;

const Icon = {
  Check: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>,
  X: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>,
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

function loadStore() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return normalizeStore(JSON.parse(raw));
  } catch (e) {}
  const seed = window.SEED_DEBTS || [];
  return normalizeStore({
    debts: seed.map(d => ({
      id: uid(),
      who: d.who,
      total: d.total,
      paid: d.paid,
      monthly: d.monthly || 0,
      note: '',
      payments: [], // {id, date, amount, note}
      custom: {},
    })),
    customCols: [],
  });
}
function normalizeStore(store) {
  const source = store && typeof store === 'object' ? store : {};
  const debts = Array.isArray(source.debts) ? source.debts : [];
  const customCols = Array.isArray(source.customCols) ? source.customCols : [];
  return {
    ...source,
    customCols,
    debts: debts.map(d => ({
      id: d.id || uid(),
      who: d.who || '',
      total: d.total ?? 0,
      paid: d.paid ?? 0,
      monthly: d.monthly ?? 0,
      note: d.note || '',
      payments: Array.isArray(d.payments) ? d.payments : [],
      custom: d.custom || {},
    })),
  };
}
function saveStore(s) { localStorage.setItem(STORAGE_KEY, JSON.stringify(s)); }

function App() {
  const [store, setStore] = useState(loadStore);
  useEffect(() => saveStore(store), [store]);
  const [openLog, setOpenLog] = useState(null); // debt id whose log is open
  const [filter, setFilter] = useState('open'); // open | paid | all

  const update = (fn) => setStore(s => fn(s));

  const setDebt = (id, patch) => setStore(s => ({
    ...s,
    debts: s.debts.map(d => d.id === id ? { ...d, ...patch } : d),
  }));
  const addDebt = () => {
    setFilter('open');
    setStore(s => ({
      ...s,
      debts: [...s.debts, { id: uid(), who: '', total: 0, paid: 0, monthly: 0, note: '', payments: [], custom: {} }],
    }));
  };
  const delDebt = (id) => {
    if (!confirm('Delete this debt?')) return;
    setStore(s => ({ ...s, debts: s.debts.filter(d => d.id !== id) }));
  };
  const addPayment = (id, payment) => setStore(s => ({
    ...s,
    debts: s.debts.map(d => {
      if (d.id !== id) return d;
      const newPayments = [...(d.payments || []), { id: uid(), ...payment }];
      const newPaid = num(d.paid) + num(payment.amount);
      return { ...d, payments: newPayments, paid: newPaid };
    }),
  }));
  const delPayment = (debtId, payId) => setStore(s => ({
    ...s,
    debts: s.debts.map(d => {
      if (d.id !== debtId) return d;
      const payments = d.payments || [];
      const p = payments.find(p => p.id === payId);
      if (!p) return d;
      return { ...d, payments: payments.filter(x => x.id !== payId), paid: num(d.paid) - num(p.amount) };
    })
  }));
  const setCustom = (id, key, val) => setStore(s => ({
    ...s,
    debts: s.debts.map(d => d.id === id ? { ...d, custom: { ...(d.custom || {}), [key]: val } } : d),
  }));
  const addCol = () => {
    const name = prompt('New column name:'); if (!name) return;
    const type = confirm('Numeric column? (OK = numeric, Cancel = text)') ? 'num' : 'text';
    setStore(s => ({ ...s, customCols: [...(s.customCols||[]), { id: uid(), name, type }] }));
  };
  const renameCol = (cid, name) => setStore(s => ({ ...s, customCols: s.customCols.map(c => c.id === cid ? { ...c, name } : c) }));
  const delCol = (cid) => {
    if (!confirm('Delete column?')) return;
    setStore(s => ({
      ...s,
      customCols: s.customCols.filter(c => c.id !== cid),
      debts: s.debts.map(d => {
        const { [cid]: _removed, ...custom } = d.custom || {};
        return { ...d, custom };
      }),
    }));
  };

  const exportJson = () => {
    const blob = new Blob([JSON.stringify(store, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `debts-${new Date().toISOString().slice(0,10)}.json`;
    a.click(); URL.revokeObjectURL(url);
  };
  const importJson = () => {
    const i = document.createElement('input');
    i.type = 'file'; i.accept = '.json,application/json';
    i.onchange = async (e) => {
      const f = e.target.files[0]; if (!f) return;
      try {
        const data = JSON.parse(await f.text());
        if (data.debts) setStore(normalizeStore(data));
      } catch { alert('Invalid file'); }
    };
    i.click();
  };
  const resetData = () => {
    if (!confirm('Reset this browser to an empty baseline?')) return;
    localStorage.removeItem(STORAGE_KEY);
    setStore(loadStore());
  };

  const sumTotal = store.debts.reduce((s,d) => s + num(d.total), 0);
  const sumPaid = store.debts.reduce((s,d) => s + num(d.paid), 0);
  const sumLeft = sumTotal - sumPaid;
  const sumMonthly = store.debts.reduce((s,d) => s + num(d.monthly), 0);

  const visible = store.debts.filter(d => {
    if (filter === 'open') return isOpenDebt(d);
    if (filter === 'paid') return isPaidDebt(d);
    return true;
  });

  return (
    <div className="app">
      <Masthead />
      <SubNav active="debts" />
      <SummaryBand totals={{sumTotal, sumPaid, sumLeft, sumMonthly, count: store.debts.length}} />

      <div className="section">
        <div className="section-head">
          <div>
            <h2>Debts</h2>
            <div className="subtitle">Velat · who you owe and how much</div>
          </div>
          <div className="right">
            <FilterTabs filter={filter} setFilter={setFilter} debts={store.debts} />
          </div>
        </div>
        <div className="col-toolbar">
          <span>{store.customCols.length === 0 ? 'No custom columns' : `${store.customCols.length} custom column${store.customCols.length===1?'':'s'}`}</span>
          <button className="btn-ghost" onClick={addCol}>+ Add column</button>
          <span style={{marginLeft:'auto'}}>{visible.length} of {store.debts.length} shown</span>
        </div>
        <DebtTable
          debts={visible}
          customCols={store.customCols}
          setDebt={setDebt}
          delDebt={delDebt}
          setCustom={setCustom}
          renameCol={renameCol}
          delCol={delCol}
          openLog={setOpenLog}
        />
        <button className="add-row" onClick={addDebt}>+ Add debt</button>
      </div>

      <footer className="footnote">
        <div>DEBTS · {store.debts.length} on file · {fmt(sumLeft)} € outstanding</div>
        <div className="right-actions">
          <a href="https://ledger.local/">Ledger</a>
          <a href="https://career.local/">Career</a>
          <button onClick={exportJson}>Export</button>
          <button onClick={importJson}>Import</button>
          <button onClick={resetData}>Reset</button>
        </div>
      </footer>

      {openLog && (
        <PaymentLogModal
          debt={store.debts.find(d => d.id === openLog)}
          onClose={() => setOpenLog(null)}
          onAdd={(p) => addPayment(openLog, p)}
          onDel={(pid) => delPayment(openLog, pid)}
        />
      )}
    </div>
  );
}

function Masthead() {
  const [theme, toggleTheme] = useTheme();
  const today = new Date().toLocaleDateString('en-GB', { weekday:'short', day:'2-digit', month:'long', year:'numeric' });
  return (
    <header className="masthead">
      <div className="brand">
        <div className="mark">De<em>b</em>ts</div>
        <div className="sub">What You Owe · Velat</div>
      </div>
      <div className="meta">
        <div style={{display:'flex', alignItems:'center', gap:14, justifyContent:'flex-end'}}>
          <button className="theme-toggle" onClick={toggleTheme} title="Toggle theme" aria-label="Toggle theme">
            {theme === 'dark' ? <Icon.Sun /> : <Icon.Moon />}
          </button>
          <span>Standing as of</span>
        </div>
        <span className="num">{new Date().toLocaleDateString('en-GB', { month:'long', year:'numeric' })}</span>
        <span style={{display:'block', marginTop:6, letterSpacing:'0.12em'}}>{today}</span>
      </div>
    </header>
  );
}

function SubNav({ active }) {
  return (
    <div className="sub-nav">
      <a href="https://ledger.local/" className={'sub-nav-link' + (active === 'ledger' ? ' active' : '')}>Monthly Ledger</a>
      <a href="https://debts.local/" className={'sub-nav-link' + (active === 'debts' ? ' active' : '')}>Debts</a>
      <a href="https://career.local/" className={'sub-nav-link' + (active === 'career' ? ' active' : '')}>Career</a>
      <a href="https://videos.local/" className={'sub-nav-link' + (active === 'videos' ? ' active' : '')}>Videos</a>
      <a href="https://pdf.local/" className={'sub-nav-link' + (active === 'pdf' ? ' active' : '')}>PDF</a>
    </div>
  );
}

function FilterTabs({ filter, setFilter, debts }) {
  const open = debts.filter(isOpenDebt).length;
  const paid = debts.filter(isPaidDebt).length;
  return (
    <div className="filter-tabs">
      <button className={filter==='open'?'active':''} onClick={() => setFilter('open')}>Open <span className="cnt">{open}</span></button>
      <button className={filter==='paid'?'active':''} onClick={() => setFilter('paid')}>Paid <span className="cnt">{paid}</span></button>
      <button className={filter==='all'?'active':''} onClick={() => setFilter('all')}>All <span className="cnt">{debts.length}</span></button>
    </div>
  );
}

function SummaryBand({ totals }) {
  const { sumTotal, sumPaid, sumLeft, sumMonthly, count } = totals;
  const pct = sumTotal > 0 ? (sumPaid / sumTotal) * 100 : 0;
  return (
    <div className="summary">
      <div className="sum-cell">
        <div className="sum-label">Total Debt</div>
        <div className="sum-value">{fmt(sumTotal)} <span style={{fontSize:14, color:'var(--ink-3)'}}>€</span></div>
        <div className="sum-foot">{count} {count===1?'debt':'debts'} on file</div>
      </div>
      <div className="sum-cell positive">
        <div className="sum-label">Paid</div>
        <div className="sum-value pos">{fmt(sumPaid)}</div>
        <div className="sum-foot">{pct.toFixed(1)}% of total</div>
      </div>
      <div className="sum-cell accent">
        <div className="sum-label">Outstanding</div>
        <div className="sum-value neg">{fmt(sumLeft)}</div>
        <div className="sum-foot">left to pay</div>
      </div>
      <div className="sum-cell" style={{gridColumn:'span 2'}}>
        <div className="sum-label">Progress</div>
        <div className="progress-bar">
          <div className="progress-fill" style={{width: pct + '%'}}></div>
          <div className="progress-label">{pct.toFixed(1)}%</div>
        </div>
        <div className="sum-foot">monthly commitment: {fmt(sumMonthly)} €</div>
      </div>
    </div>
  );
}

function DebtTable({ debts, customCols, setDebt, delDebt, setCustom, renameCol, delCol, openLog }) {
  return (
    <table className="ledger">
      <thead>
        <tr>
          <th style={{width:36}}></th>
          <th>Who</th>
          <th className="num">Total (€)</th>
          <th className="num">Paid (€)</th>
          <th className="num">Left (€)</th>
          <th className="num">Monthly (€)</th>
          <th>Progress</th>
          {customCols.map(c => (
            <th key={c.id} className={c.type==='num'?'num':''}>
              <span className="col-header-edit">
                <input value={c.name} onChange={e => renameCol(c.id, e.target.value)} />
                <button className="x" onClick={() => delCol(c.id)} title={`Delete ${c.name} column`} aria-label={`Delete ${c.name} column`}><Icon.X /></button>
              </span>
            </th>
          ))}
          <th className="center" style={{width:90}}>Log</th>
        </tr>
      </thead>
      <tbody>
        {debts.length === 0 && (
          <tr><td colSpan={8 + customCols.length} className="empty">No debts in this filter.</td></tr>
        )}
        {debts.map((d, idx) => {
          const left = num(d.total) - num(d.paid);
          const pct = num(d.total) > 0 ? Math.min(100, (num(d.paid) / num(d.total)) * 100) : 0;
          const done = left <= 0.001 && num(d.total) > 0;
          return (
            <tr key={d.id} className={done ? 'paid' : ''}>
              <td className="row-actions">
                <span style={{fontFamily:'var(--mono)', fontSize:10, color:'var(--ink-3)', minWidth:18, textAlign:'center'}}>{idx+1}</span>
                <button onClick={() => delDebt(d.id)} title="Delete"><Icon.Trash /></button>
              </td>
              <td><input className="cell-input" value={d.who||''} placeholder="Name" onChange={e => setDebt(d.id, { who: e.target.value })} /></td>
              <td><input className="cell-input num" type="text" inputMode="decimal" step="0.01" value={d.total||''} placeholder="0.00" onChange={e => setDebt(d.id, { total: e.target.value })} /></td>
              <td><input className="cell-input num" type="text" inputMode="decimal" step="0.01" value={d.paid||''} placeholder="0.00" onChange={e => setDebt(d.id, { paid: e.target.value })} /></td>
              <td className="num" style={{padding:'12px 14px', fontFamily:'var(--mono)', fontSize:13, color: left > 0 ? 'var(--accent)' : 'var(--paid)', fontWeight: 500, fontVariantNumeric:'tabular-nums'}}>{fmt(left)}</td>
              <td><input className="cell-input num" type="text" inputMode="decimal" step="0.01" value={d.monthly||''} placeholder="0.00" onChange={e => setDebt(d.id, { monthly: e.target.value })} /></td>
              <td style={{padding:'10px 14px'}}>
                <div className="row-progress">
                  <div className="row-progress-fill" style={{width: pct + '%'}}></div>
                  <span>{pct.toFixed(0)}%</span>
                </div>
              </td>
              {customCols.map(c => (
                <td key={c.id}>
                  <input className={'cell-input' + (c.type==='num'?' num':'')}
                    type="text"
                    inputMode={c.type==='num' ? 'decimal' : undefined}
                    step="0.01"
                    value={(d.custom?.[c.id]) ?? ''}
                    onChange={e => setCustom(d.id, c.id, e.target.value)} />
                </td>
              ))}
              <td className="check-cell">
                <button className="btn-ghost" onClick={() => openLog(d.id)} title="Payment log">
                  {(d.payments || []).length} <span style={{opacity:0.6, fontSize:9, marginLeft:3}}>►</span>
                </button>
              </td>
            </tr>
          );
        })}
      </tbody>
      <tfoot>
        <tr>
          <td colSpan={2} className="label-cell">Subtotal ({debts.length})</td>
          <td className="num">{fmt(debts.reduce((s,d)=>s+num(d.total),0))} €</td>
          <td className="num">{fmt(debts.reduce((s,d)=>s+num(d.paid),0))} €</td>
          <td className="num">{fmt(debts.reduce((s,d)=>s+(num(d.total)-num(d.paid)),0))} €</td>
          <td className="num">{fmt(debts.reduce((s,d)=>s+num(d.monthly),0))} €</td>
          <td colSpan={2 + customCols.length}></td>
        </tr>
      </tfoot>
    </table>
  );
}

function PaymentLogModal({ debt, onClose, onAdd, onDel }) {
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0,10));
  const [note, setNote] = useState('');

  if (!debt) return null;

  const submit = () => {
    const a = num(amount); if (a <= 0) return;
    onAdd({ amount: a, date, note });
    setAmount(''); setNote('');
  };

  const sortedPays = [...(debt.payments || [])].sort((a,b) => (b.date||'').localeCompare(a.date||''));
  const left = num(debt.total) - num(debt.paid);

  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" style={{width: 520}} onClick={e => e.stopPropagation()}>
        <h3 style={{marginBottom:6}}>Payment log · {debt.who || 'Unnamed'}</h3>
        <div style={{fontFamily:'var(--mono)', fontSize:11, color:'var(--ink-3)', letterSpacing:'0.1em', textTransform:'uppercase', marginBottom:20}}>
          {fmt(debt.paid)} of {fmt(debt.total)} € paid · {fmt(left)} € left
        </div>

        <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:8}}>
          <div>
            <label>Amount (€)</label>
            <input type="text" inputMode="decimal" step="0.01" value={amount} onChange={e=>setAmount(e.target.value)} placeholder="0.00" />
          </div>
          <div>
            <label>Date</label>
            <input type="text" value={date} onChange={e=>setDate(e.target.value)} placeholder="YYYY-MM-DD" />
          </div>
        </div>
        <label>Note (optional)</label>
        <input type="text" value={note} onChange={e=>setNote(e.target.value)} placeholder="e.g. cash, mobilepay" />

        <div className="modal-actions" style={{justifyContent:'space-between', marginBottom:24}}>
          <button className="btn-link" onClick={onClose}>Close</button>
          <button className="btn-primary" onClick={submit}>+ Record payment</button>
        </div>

        <div style={{borderTop:'1px solid var(--rule)', paddingTop:14}}>
          <div style={{fontFamily:'var(--mono)', fontSize:10, letterSpacing:'0.15em', textTransform:'uppercase', color:'var(--ink-3)', marginBottom:10}}>
            History · {sortedPays.length} payment{sortedPays.length===1?'':'s'}
          </div>
          {sortedPays.length === 0 ? (
            <div className="empty" style={{padding:20, fontSize:14}}>No payments logged yet.</div>
          ) : (
            <div className="pay-list">
              {sortedPays.map(p => (
                <div key={p.id} className="pay-row">
                  <span className="pay-date">{p.date || '—'}</span>
                  <span className="pay-amt">{fmt(p.amount)} €</span>
                  <span className="pay-note">{p.note || ''}</span>
                  <button className="x" onClick={() => onDel(p.id)} title="Delete"><Icon.Trash /></button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<App />);
