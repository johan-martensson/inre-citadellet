// Inre Citadellet – spellogik
const VIRTUES = ["Visdom", "Mod", "Rättvisa", "Måttfullhet"];
const ARCHETYPES = ["Persona", "Skuggan", "Anima/Animus", "Självet"];
const SAVE_KEY = "inre-citadellet-v1";

const app = document.getElementById("app");
let S = null;        // sparat spelläge
let draft = null;    // pågående (osparat) svar från en spelare

// ---------- hjälpfunktioner ----------
const shuffle = (a) => { a = [...a]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const save = () => { try { localStorage.setItem(SAVE_KEY, JSON.stringify(S)); } catch (e) {} };
const load = () => { try { const s = localStorage.getItem(SAVE_KEY); return s ? JSON.parse(s) : null; } catch (e) { return null; } };
const clearSave = () => { try { localStorage.removeItem(SAVE_KEY); } catch (e) {} };
const deckOf = (type) => (type === "control" ? CONTROL_CARDS : SHADOW_CARDS);
const name = (i) => esc(S.players[i].name);
const other = (i) => 1 - i;
const ctxOf = (c) => c.contexts || [null];               // skuggkort kan ha flera situationer
const arr = (v) => (Array.isArray(v) ? v : [v]);

// Poäng i Skuggspegeln utifrån sammanlagd avvikelse mellan gissning och svar.
function shadowPoints(diffs) {
  const d = diffs.reduce((a, b) => a + b, 0);
  if (diffs.length === 1) return d === 0 ? 3 : d === 1 ? 1 : 0;
  return d === 0 ? 3 : d <= 2 ? 2 : d <= 4 ? 1 : 0;
}

// ---------- spelflöde ----------
function newGame(names, rounds) {
  S = {
    players: names.map((n) => ({ name: n, score: 0, tokens: [] })),
    rounds, round: 0, vetos: [1, 1],
    decks: { control: shuffle(CONTROL_CARDS.map((_, i) => i)), shadow: shuffle(SHADOW_CARDS.map((_, i) => i)) },
    cur: null, phase: "intro",
  };
  startRound();
}

function drawCard(type) {
  if (!S.decks[type].length) S.decks[type] = shuffle(deckOf(type).map((_, i) => i));
  return S.decks[type].pop();
}

function startRound() {
  const type = S.round % 2 === 0 ? "control" : "shadow";
  const first = Math.floor(S.round / 2) % 2;
  S.cur = { type, card: drawCard(type), first, answers: [null, null], result: null };
  shuffleCardOrder();
  S.phase = "intro";
  render();
}

function shuffleCardOrder() {
  if (S.cur.type === "control") {
    const c = CONTROL_CARDS[S.cur.card];
    S.cur.itemOrder = shuffle(c.items.map((_, i) => i));
    S.cur.respOrder = shuffle(c.responses.map((_, i) => i));
  }
}

function useVeto(p) {
  if (!S.vetos[p]) return;
  S.vetos[p] = 0;
  S.cur.card = drawCard(S.cur.type);
  shuffleCardOrder();
  render();
}

function go(phase, who) { S.phase = phase; S.cur.who = who; draft = null; render(); window.scrollTo(0, 0); }

function submitAnswer() {
  const p = S.cur.who;
  S.cur.answers[p] = draft;
  if (p === S.cur.first) go("handover", other(p));
  else { scoreRound(); go("together"); }
}

function scoreRound() {
  const cur = S.cur;
  let pts, token;
  if (cur.type === "control") {
    const c = CONTROL_CARDS[cur.card];
    pts = cur.answers.map((a, i) => {
      const correct = c.items.reduce((n, it, k) => n + (a.items[k] === it.c ? 1 : 0), 0);
      // Reaktionen i sig ger inga poäng, så det finns inget "rätt" svar att räkna ut.
      // Poäng ges för att läsa den andra rätt (+2) och för att själv bli igenkänd (+1).
      const guess = a.guess === cur.answers[other(i)].resp ? 2 : 0;
      const known = cur.answers[other(i)].guess === a.resp ? 1 : 0;
      return { correct, guess, known, total: correct + guess + known };
    });
    token = c.virtue;
  } else {
    const c = SHADOW_CARDS[cur.card];
    pts = cur.answers.map((a, i) => {
      const self = arr(cur.answers[other(i)].self);
      const diffs = arr(a.guess).map((g, k) => Math.abs(g - self[k]));
      return { diffs, total: shadowPoints(diffs) };
    });
    token = c.arch;
  }
  const best = Math.max(pts[0].total, pts[1].total);
  const winners = [0, 1].filter((i) => best > 0 && pts[i].total === best);
  pts.forEach((r, i) => (S.players[i].score += r.total));
  winners.forEach((i) => { if (!S.players[i].tokens.includes(token)) S.players[i].tokens.push(token); });
  const low = pts[0].total === pts[1].total ? cur.first : (pts[0].total < pts[1].total ? 0 : 1);
  cur.result = { pts, token, winners, starter: low };
}

function nextRound() {
  S.round++;
  if (S.round >= S.rounds) { S.phase = "end"; render(); }
  else startRound();
  window.scrollTo(0, 0);
}

// ---------- rendering ----------
function scoreboard() {
  const chips = (p) => [...VIRTUES, ...ARCHETYPES].map((t) =>
    `<span class="chip ${p.tokens.includes(t) ? "on" : ""}" title="${t}">${t}</span>`).join("");
  return `<header class="board">
    <div class="round">Runda ${Math.min(S.round + 1, S.rounds)} av ${S.rounds}</div>
    <div class="players">
      ${S.players.map((p, i) => `<div class="pl p${i}">
        <div class="pl-top"><span class="pl-name">${esc(p.name)}</span><span class="pl-score">${p.score}</span></div>
        <div class="chips">${chips(p)}</div></div>`).join("")}
    </div></header>`;
}

function quoteBlock(q) {
  return `<blockquote><p>”${q.t}”</p><cite>${q.src}</cite></blockquote>`;
}

function render() {
  if (S) save();
  const v = VIEWS[S ? S.phase : "start"]();
  app.innerHTML = (S && S.phase !== "end" ? scoreboard() : "") + `<main>${v}</main>`;
}

const VIEWS = {
  start() {
    const saved = load();
    const canResume = saved && saved.phase !== "end";
    return `<section class="hero">
      <h1>Inre Citadellet</h1>
      <p class="sub">Ett spel för två om stoisk ro och jungiansk självkännedom</p>
    </section>
    ${canResume ? `<div class="card center"><p>Ni har ett pågående spel: ${esc(saved.players[0].name)} mot ${esc(saved.players[1].name)}, runda ${saved.round + 1} av ${saved.rounds}.</p>
      <button class="btn" data-action="resume">Fortsätt spelet</button></div>` : ""}
    <form class="card" id="setup">
      <h2>Nytt spel</h2>
      <label>Spelare 1<input name="p0" required maxlength="20" placeholder="Namn"></label>
      <label>Spelare 2<input name="p1" required maxlength="20" placeholder="Namn"></label>
      <label>Antal rundor
        <select name="rounds"><option>4</option><option selected>6</option><option>8</option><option>10</option></select>
      </label>
      <button class="btn" type="submit">Börja spela</button>
    </form>
    <details class="card rules"><summary>Så spelar ni</summary>
      <p>Rundorna växlar mellan två typer:</p>
      <p><strong>Kontrolldikotomin (stoisk).</strong> Ni får en vardagssituation. Var och en avgör i hemlighet vad som ligger <em>i min makt</em> och vad som inte gör det, och väljer hur man faktiskt skulle reagera, inte hur man borde. Ni gissar också hur den andra reagerar. Ni får 1 poäng per rätt sortering, 2 poäng om ni gissar rätt på den andras reaktion och 1 poäng om den andra gissar rätt på er. Den egna reaktionen ger inga poäng, så ärlighet lönar sig: den som visar sitt verkliga jag blir lättare att känna igen.</p>
      <p><strong>Skuggspegeln (jungiansk).</strong> Ni får ett påstående om er själva. Var och en svarar i hemlighet hur väl det stämmer, och gissar sedan vad partnern svarade. Rätt gissning ger 3 poäng och en gissning som är ett steg ifrån ger 1 poäng. Vissa kort delas upp i flera situationer, till exempel hemma och på jobbet. Då räknas den sammanlagda avvikelsen: ingen avvikelse ger 3 poäng, högst 2 steg ger 2 poäng och högst 4 steg ger 1 poäng. Att svara ärligt lönar sig, eftersom det är så ni lär er läsa varandra.</p>
      <p><strong>Dygder och arketyper.</strong> Den som vinner en runda erövrar rundans dygd eller arketyp. Varje unik symbol ger en bonuspoäng i slutet. Det är vägen mot Självet.</p>
      <p><strong>Reflektion.</strong> Varje runda avslutas med en fråga att prata om. Den som fick lägst poäng svarar först.</p>
      <p><strong>Veto.</strong> Var och en har ett veto per spel och kan använda det för att byta ut ett kort som känns fel just i dag.</p>
    </details>`;
  },

  intro() {
    const { type, card } = S.cur;
    const vetoBtns = [0, 1].filter((i) => S.vetos[i]).map((i) =>
      `<button class="btn ghost small" data-action="veto" data-p="${i}">Veto (${name(i)})</button>`).join("");
    const body = type === "control"
      ? `<div class="kind">Kontrolldikotomin · ${CONTROL_CARDS[card].virtue}</div>
         <h2>${CONTROL_CARDS[card].title}</h2><p class="lead">${CONTROL_CARDS[card].text}</p>
         <p class="hint">Var och en avgör i hemlighet vad som ligger i er makt, hur ni skulle reagera och hur ni tror att den andra skulle reagera.</p>`
      : `<div class="kind">Skuggspegeln · ${SHADOW_CARDS[card].arch}</div>
         <h2>Hur väl stämmer det här på dig?</h2><p class="lead">”${SHADOW_CARDS[card].trait}”</p>
         <p class="hint">Var och en svarar i hemlighet om sig själv och gissar sedan vad den andra svarade.</p>`;
    return `<div class="card">${body}
      <div class="row"><button class="btn" data-action="handover">${name(S.cur.first)} börjar</button>${vetoBtns}</div></div>`;
  },

  handover() {
    return `<div class="card center pass">
      <p class="hint">Lämna över enheten till</p>
      <h2 class="big">${name(S.cur.who)}</h2>
      <p class="hint">${name(other(S.cur.who))} tittar bort.</p>
      <button class="btn" data-action="ready">Jag är redo</button></div>`;
  },

  input() {
    const p = S.cur.who;
    if (S.cur.type === "control") {
      const c = CONTROL_CARDS[S.cur.card];
      draft = draft || { items: c.items.map(() => null), resp: null, guess: null };
      return `<div class="card">
        <div class="kind">${name(p)} svarar i hemlighet</div>
        <h2>${c.title}</h2><p class="lead">${c.text}</p>
        <h3>Vad ligger i din makt?</h3>
        ${S.cur.itemOrder.map((i) => `<div class="sort" data-item="${i}">
          <span>${c.items[i].t}</span>
          <div class="seg">
            <button data-action="sort" data-i="${i}" data-v="1">I min makt</button>
            <button data-action="sort" data-i="${i}" data-v="0">Utom min makt</button>
          </div></div>`).join("")}
        <h3>Hur skulle du faktiskt reagera?</h3>
        <p class="hint">Var ärlig. Reaktionen ger inga poäng i sig, men du får poäng om ${name(other(p))} känner igen dig.</p>
        <div class="opts">${S.cur.respOrder.map((r) => `<button class="opt" data-action="resp" data-r="${r}">${c.responses[r].t}</button>`).join("")}</div>
        <h3>Hur tror du att ${name(other(p))} reagerar?</h3>
        <div class="opts">${S.cur.respOrder.map((r) => `<button class="opt" data-action="guessResp" data-r="${r}">${c.responses[r].t}</button>`).join("")}</div>
        <button class="btn" data-action="submit" id="submit" disabled>Lås mitt svar</button></div>`;
    }
    const c = SHADOW_CARDS[S.cur.card];
    const ctx = ctxOf(c);
    draft = draft || { self: ctx.map(() => null), guess: ctx.map(() => null) };
    const scale = (key) => ctx.map((cx, k) => `${cx ? `<div class="ctx">${cx}</div>` : ""}
      <div class="scale">${[1, 2, 3, 4, 5].map((n) =>
      `<button data-action="scale" data-k="${key}" data-c="${k}" data-n="${n}">${n}</button>`).join("")}</div>
      <div class="scale-lbl"><span>Inte alls</span><span>Helt och hållet</span></div>`).join("");
    return `<div class="card">
      <div class="kind">${name(p)} svarar i hemlighet</div>
      <p class="lead">”${c.trait}”</p>
      ${ctx.length > 1 ? `<p class="hint">Det kan skilja sig mellan olika situationer, så svara för var och en.</p>` : ""}
      <h3>Hur väl stämmer det på dig?</h3>${scale("self")}
      <h3>Vad tror du att ${name(other(p))} svarar om sig själv?</h3>${scale("guess")}
      <button class="btn" data-action="submit" id="submit" disabled>Lås mitt svar</button></div>`;
  },

  together() {
    return `<div class="card center pass">
      <p class="hint">Båda har svarat</p>
      <h2 class="big">Sätt er tillsammans</h2>
      <button class="btn" data-action="reveal">Visa svaren</button></div>`;
  },

  reveal() {
    const { type, card, answers, result } = S.cur;
    const ptsLine = `<div class="pts">${[0, 1].map((i) =>
      `<div class="p${i}"><span>${name(i)}</span><strong>+${result.pts[i].total}</strong></div>`).join("")}</div>`;
    const tokenLine = result.winners.length
      ? `<p class="token">${result.winners.map(name).join(" och ")} erövrar <strong>${result.token}</strong></p>`
      : `<p class="token">Ingen erövrar ${result.token} den här gången.</p>`;
    let body;
    if (type === "control") {
      const c = CONTROL_CARDS[card];
      const mark = (ok) => `<span class="${ok ? "good" : "bad"}">${ok ? "✓" : "✗"}</span>`;
      body = `<h2>${c.title}</h2>
        <table class="res"><thead><tr><th></th><th>Facit</th><th>${name(0)}</th><th>${name(1)}</th></tr></thead><tbody>
        ${S.cur.itemOrder.map((i) => `<tr><td>${c.items[i].t}${c.items[i].why ? `<div class="why">${c.items[i].why}</div>` : ""}</td>
          <td class="ans">${c.items[i].c ? "I min makt" : "Utom"}</td>
          <td>${mark(answers[0].items[i] === c.items[i].c)}</td><td>${mark(answers[1].items[i] === c.items[i].c)}</td></tr>`).join("")}
        </tbody></table>
        <h3>Reaktionerna</h3>
        ${S.cur.respOrder.map((r) => {
          const who = [0, 1].filter((i) => answers[i].resp === r).map((i) => `<span class="tag p${i}">${name(i)}</span>`).join("");
          return `<div class="optres"><span class="otext">${c.responses[r].t}</span>${who}</div>`;
        }).join("")}
        <h3>Gissningarna</h3>
        ${[0, 1].map((i) => {
          const ok = answers[i].guess === answers[other(i)].resp;
          const g = c.responses[answers[i].guess];
          return `<div class="optres"><span class="rp">${ok ? "+2" : "0"}</span><span><span class="p${i}"><strong>${name(i)}</strong></span> trodde att ${name(other(i))} skulle välja: <em>${g ? g.t : "–"}</em></span>${mark(ok)}</div>`;
        }).join("")}
        ${[0, 1].filter((i) => result.pts[i].known).map((i) =>
          `<p class="hint">${name(i)} blev igenkänd och får +1.</p>`).join("")}
        <h3>Det stoiska idealet</h3>
        <p>${c.responses.find((r) => r.p === 2).t}</p>
        ${[0, 1].some((i) => c.responses[answers[i].resp].p < 2)
          ? `<p class="hint">Att erkänna att man inte alltid lever upp till idealet är början på all stoisk övning. Vad skulle krävas för att välja idealet nästa gång?</p>` : ""}
        <p class="insight">${c.insight}</p>${quoteBlock(c.quote)}`;
    } else {
      const c = SHADOW_CARDS[card];
      const ctx = ctxOf(c);
      const mirror = ctx.length === 1
        ? `<div class="mirror">${[0, 1].map((i) => `<div class="p${i}">
          <div class="mname">${name(i)}</div>
          <div class="mval"><span>Svarade om sig själv</span><strong>${arr(answers[i].self)[0]}</strong></div>
          <div class="mval"><span>${name(other(i))} gissade</span><strong>${arr(answers[other(i)].guess)[0]}</strong></div>
        </div>`).join("")}</div>`
        : [0, 1].map((i) => {
          const self = arr(answers[i].self), g = arr(answers[other(i)].guess);
          const spread = Math.max(...self) - Math.min(...self);
          return `<div class="mtable p${i}"><div class="mname">${name(i)}</div>
          <table class="res"><thead><tr><th></th><th>Svar</th><th>${name(other(i))} gissade</th></tr></thead><tbody>
          ${ctx.map((cx, k) => `<tr><td>${cx}</td><td><strong>${self[k]}</strong></td><td>${g[k]}</td></tr>`).join("")}
          </tbody></table>
          ${spread >= 2 ? `<p class="hint">${name(i)} skiftar mellan situationerna. Personan ser olika ut beroende på sammanhang. Vad är det som gör skillnaden?</p>` : ""}</div>`;
        }).join("");
      body = `<p class="lead">”${c.trait}”</p>${mirror}
        <p class="insight">${c.insight}</p>${quoteBlock(c.quote)}`;
    }
    return `<div class="card">${body}${ptsLine}${tokenLine}
      <button class="btn" data-action="reflect">Till reflektionen</button></div>`;
  },

  reflect() {
    const c = deckOf(S.cur.type)[S.cur.card];
    const last = S.round + 1 >= S.rounds;
    const ans = S.cur.result.starter, ask = other(ans);
    return `<div class="card center reflect">
      <div class="kind">Reflektion</div>
      <p class="asker"><span class="p${ask}">${name(ask)}</span> läser högt och frågar <span class="p${ans}">${name(ans)}</span>:</p>
      <p class="question">${c.reflect}</p>
      <p class="hint">${name(ans)} svarar och ${name(ask)} lyssnar utan att avbryta. Byt sedan roller, så att ${name(ans)} ställer samma fråga till ${name(ask)}.</p>
      <button class="btn ghost small" data-action="swapAsker">⇄ Byt frågeställare</button><br>
      <button class="btn" data-action="next">${last ? "Avsluta spelet" : "Vi har pratat klart, nästa runda"}</button></div>`;
  },

  end() {
    const final = S.players.map((p) => ({ ...p, bonus: p.tokens.length, total: p.score + p.tokens.length }));
    const w = final[0].total === final[1].total ? null : (final[0].total > final[1].total ? 0 : 1);
    clearSave();
    return `<section class="hero">
      <h1>${w === null ? "Oavgjort" : `${esc(final[w].name)} vinner`}</h1>
      <p class="sub">${w === null ? "Två vägar mot Självet, lika långt komna." : "Men i det här spelet har båda kommit närmare varandra."}</p></section>
      <div class="card">
      ${final.map((p, i) => `<div class="final p${i}">
        <div class="pl-top"><span class="pl-name">${esc(p.name)}</span><span class="pl-score">${p.total}</span></div>
        <p class="hint">${p.score} poäng + ${p.bonus} för dygder och arketyper</p>
        <div class="chips">${[...VIRTUES, ...ARCHETYPES].map((t) => `<span class="chip ${p.tokens.includes(t) ? "on" : ""}">${t}</span>`).join("")}</div>
      </div>`).join("")}
      </div>
      <div class="card center reflect">
        <div class="kind">Avslutande reflektion</div>
        <p class="asker">Ställ frågan till varandra, en i taget:</p>
        <p class="question">Vad lärde du dig om mig i kväll som du inte visste förut?</p>
        ${quoteBlock({ t: "Mötet mellan två personligheter är som kontakten mellan två kemiska ämnen: om det sker en reaktion förvandlas båda.", src: "C.G. Jung" })}
        <button class="btn" data-action="restart">Spela igen</button></div>`;
  },
};

// ---------- händelser ----------
function updateSubmit() {
  const btn = document.getElementById("submit");
  if (!btn) return;
  btn.disabled = S.cur.type === "control"
    ? draft.items.some((v) => v === null) || draft.resp === null || draft.guess === null
    : [...draft.self, ...draft.guess].some((v) => v === null);
}

app.addEventListener("submit", (e) => {
  if (e.target.id !== "setup") return;
  e.preventDefault();
  const f = new FormData(e.target);
  const names = [f.get("p0").trim(), f.get("p1").trim()];
  if (!names[0] || !names[1]) return;
  newGame(names, parseInt(f.get("rounds"), 10));
});

app.addEventListener("click", (e) => {
  const b = e.target.closest("[data-action]");
  if (!b) return;
  const a = b.dataset.action;
  switch (a) {
    case "resume":
      S = load();
      // Ett halvfärdigt svar sparas inte, så spelaren får börja om från överlämningen.
      if (S.phase === "input") S.phase = "handover";
      render(); break;
    case "veto": useVeto(+b.dataset.p); break;
    case "handover": go("handover", S.cur.first); break;
    case "ready": go("input", S.cur.who); break;
    case "sort":
      draft.items[+b.dataset.i] = b.dataset.v === "1";
      b.parentElement.querySelectorAll("button").forEach((x) => x.classList.toggle("sel", x === b));
      updateSubmit(); break;
    case "resp":
    case "guessResp":
      draft[a === "resp" ? "resp" : "guess"] = +b.dataset.r;
      b.parentElement.querySelectorAll(".opt").forEach((x) => x.classList.toggle("sel", x === b));
      updateSubmit(); break;
    case "scale":
      draft[b.dataset.k][+b.dataset.c] = +b.dataset.n;
      b.parentElement.querySelectorAll("button").forEach((x) => x.classList.toggle("sel", x === b));
      updateSubmit(); break;
    case "submit": submitAnswer(); break;
    case "reveal": go("reveal"); break;
    case "reflect": go("reflect"); break;
    case "swapAsker": S.cur.result.starter = other(S.cur.result.starter); render(); break;
    case "next": nextRound(); break;
    case "restart": S = null; render(); break;
  }
});

render();
