"use strict";

/* =========================================================
   SRI PIYARATHANA DHAMMA SCHOOL CRICKET TOURNAMENT
   (Setup -> Groups -> Round Robin -> Q1 + Eliminator -> Q2 -> Final -> Champion)
   ========================================================= */

const STORAGE_KEY = "spds_tournament_v4";
const $ = id => document.getElementById(id);

let tournament = null;

function isKnockoutStage(stage) {
    return ["Qualifier 1", "Eliminator", "Qualifier 2", "Final"].includes(stage);
}

/* =========================================================
   DEFAULT STATE
   ========================================================= */

function newTournament() {
    return {
        stage: "setup",       // setup -> teams -> group -> playoffs -> final -> complete
        numTeams: 6,
        maxOvers: 5,
        sheetsUrl: "",
        groupA: [],
        groupB: [],
        schedule: [],
        champion: null,
        liveMatch: null,
        bestBatsman: null,
        bestBowler: null,
        playerOfTournament: null
    };
}

function createTeam(name) {
    return {
        name,
        played: 0, won: 0, lost: 0, tied: 0, points: 0,
        runsFor: 0, ballsFor: 0,
        runsAgainst: 0, ballsAgainst: 0,
        nrr: 0
    };
}

function createFixture(id, stage, round, teamA, teamB) {
    return {
        id, stage, round,
        teamA, teamB,
        status: "pending",
        result: null,
        winner: null,
        matchSnapshot: null,
        playerOfMatch: null
    };
}

/* =========================================================
   PERSISTENCE
   ========================================================= */

function saveTournament() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tournament));
}

function loadTournament() {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) {
        tournament = newTournament();
        return;
    }
    try {
        tournament = JSON.parse(saved);
        if (tournament.bestBatsman === undefined) tournament.bestBatsman = null;
        if (tournament.bestBowler === undefined) tournament.bestBowler = null;
        if (tournament.playerOfTournament === undefined) tournament.playerOfTournament = null;
    } catch (e) {
        console.error(e);
        tournament = newTournament();
    }
}

/* =========================================================
   MODAL SYSTEM
   ========================================================= */

function hideModal() {
    $("modalOverlay").classList.add("hidden");
}

function showModal({ title, bodyHtml, buttons }) {
    $("modalTitle").textContent = title;
    $("modalBody").innerHTML = bodyHtml;
    const actions = $("modalActions");
    actions.innerHTML = "";
    buttons.forEach(b => {
        const btn = document.createElement("button");
        btn.textContent = b.label;
        btn.className = b.className || "primary-btn";
        btn.addEventListener("click", b.onClick);
        actions.appendChild(btn);
    });
    $("modalOverlay").classList.remove("hidden");
}

function showAlert(message, title = "Notice") {
    showModal({
        title,
        bodyHtml: `<p>${escapeHTML(message)}</p>`,
        buttons: [{ label: "OK", onClick: hideModal }]
    });
}

function showConfirm({ title, message, confirmLabel = "Confirm", onConfirm }) {
    showModal({
        title,
        bodyHtml: `<p>${escapeHTML(message)}</p>`,
        buttons: [
            { label: "Cancel", className: "secondary-btn", onClick: hideModal },
            { label: confirmLabel, className: "danger-btn", onClick: () => { hideModal(); onConfirm(); } }
        ]
    });
}

function showPromptModal({ title, placeholder = "", defaultValue = "", onSubmit }) {
    showModal({
        title,
        bodyHtml: `<input id="modalInput" type="text" placeholder="${escapeHTML(placeholder)}" value="${escapeHTML(defaultValue)}">`,
        buttons: [
            { label: "Cancel", className: "secondary-btn", onClick: hideModal },
            {
                label: "Confirm",
                onClick: () => {
                    const v = $("modalInput").value.trim();
                    hideModal();
                    onSubmit(v);
                }
            }
        ]
    });
    setTimeout(() => { const el = $("modalInput"); if (el) el.focus(); }, 50);
}

function showTieBreakModal(fixture, onPick) {
    showModal({
        title: "Match Tied — Select Winner",
        bodyHtml: `<p>Scores finished level. This is a knockout match, so pick the team that advances (e.g. Super Over winner).</p>`,
        buttons: [
            { label: fixture.teamA, onClick: () => { hideModal(); onPick(fixture.teamA); } },
            { label: fixture.teamB, onClick: () => { hideModal(); onPick(fixture.teamB); } }
        ]
    });
}

/* =========================================================
   SCREEN NAVIGATION
   ========================================================= */

function showScreen(name) {
    document.querySelectorAll(".screen").forEach(s => s.classList.add("hidden"));
    $(name).classList.remove("hidden");

    const stepMap = {
        screenSetup: "setup",
        screenTeams: "teams",
        screenTournament: "tournament",
        screenLive: "tournament",
        screenChampion: "champion"
    };
    const active = stepMap[name];
    document.querySelectorAll(".step").forEach(step => {
        step.classList.remove("active", "done");
        const order = ["setup", "teams", "tournament", "champion"];
        if (order.indexOf(step.dataset.step) < order.indexOf(active)) step.classList.add("done");
        if (step.dataset.step === active) step.classList.add("active");
    });

    window.scrollTo({ top: 0, behavior: "smooth" });
}

/* =========================================================
   SETUP SCREEN
   ========================================================= */

$("btnCreateTournament").addEventListener("click", () => {

    const numTeams = parseInt($("numTeams").value);
    const maxOvers = parseInt($("maxOvers").value);
    const sheetsUrl = $("sheetsUrl").value.trim();

    if (!numTeams || numTeams < 4) {
        $("setupError").textContent = "Enter at least 4 teams.";
        return;
    }
    if (!maxOvers || maxOvers < 1) {
        $("setupError").textContent = "Enter a valid number of overs.";
        return;
    }

    $("setupError").textContent = "";

    tournament = newTournament();
    tournament.numTeams = numTeams;
    tournament.maxOvers = maxOvers;
    tournament.sheetsUrl = sheetsUrl;
    tournament.stage = "teams";

    renderTeamNameInputs(numTeams);
    saveTournament();
    showScreen("screenTeams");
});

function renderTeamNameInputs(n) {
    const container = $("teamNamesContainer");
    container.innerHTML = "";
    for (let i = 1; i <= n; i++) {
        const row = document.createElement("div");
        row.className = "team-input-row";
        row.innerHTML = `<span>${i}</span><input type="text" class="teamNameInput" placeholder="Team ${i}" value="Team ${i}">`;
        container.appendChild(row);
    }
}

$("btnBackToSetup").addEventListener("click", () => showScreen("screenSetup"));

/* =========================================================
   TEAMS SCREEN -> GROUPS + SCHEDULE
   ========================================================= */

$("btnConfirmTeams").addEventListener("click", () => {

    const inputs = document.querySelectorAll(".teamNameInput");
    let names = Array.from(inputs).map(inp => inp.value.trim());

    const seen = {};
    names = names.map((name, i) => {
        if (!name) name = `Team ${i + 1}`;
        if (seen[name.toLowerCase()]) {
            seen[name.toLowerCase()]++;
            name = `${name} (${seen[name.toLowerCase()]})`;
        } else {
            seen[name.toLowerCase()] = 1;
        }
        return name;
    });

    const half = Math.ceil(names.length / 2);
    const namesA = names.slice(0, half);
    const namesB = names.slice(half);

    if (namesB.length < 2) {
        $("teamsSetupError").textContent = "Need at least 2 teams in each group. Increase team count.";
        return;
    }

    tournament.groupA = namesA.map(createTeam);
    tournament.groupB = namesB.map(createTeam);

    const fixturesA = generateRoundRobin(namesA);
    const fixturesB = generateRoundRobin(namesB);

    const maxRound = Math.max(
        fixturesA.length ? Math.max(...fixturesA.map(f => f.round)) : 0,
        fixturesB.length ? Math.max(...fixturesB.map(f => f.round)) : 0
    );

    const schedule = [];
    let gaCounter = 1, gbCounter = 1;

    for (let r = 1; r <= maxRound; r++) {
        fixturesA.filter(f => f.round === r).forEach(f => {
            schedule.push(createFixture(`GA-${gaCounter++}`, "Group A", r, f.teamA, f.teamB));
        });
        fixturesB.filter(f => f.round === r).forEach(f => {
            schedule.push(createFixture(`GB-${gbCounter++}`, "Group B", r, f.teamA, f.teamB));
        });
    }

    tournament.schedule = schedule;
    tournament.stage = "group";

    saveTournament();
    renderTournamentScreen();
    showScreen("screenTournament");
});

/* Round robin circle method. Returns [{round, teamA, teamB}] */
function generateRoundRobin(teamNames) {

    let arr = [...teamNames];
    if (arr.length < 2) return [];

    if (arr.length % 2 !== 0) arr.push("__BYE__");

    const n = arr.length;
    const rounds = n - 1;
    const half = n / 2;
    const fixtures = [];

    for (let r = 0; r < rounds; r++) {
        for (let i = 0; i < half; i++) {
            const t1 = arr[i];
            const t2 = arr[n - 1 - i];
            if (t1 !== "__BYE__" && t2 !== "__BYE__") {
                fixtures.push({ round: r + 1, teamA: t1, teamB: t2 });
            }
        }
        const fixed = arr[0];
        const rest = arr.slice(1);
        rest.unshift(rest.pop());
        arr = [fixed, ...rest];
    }

    return fixtures;
}

/* =========================================================
   TOURNAMENT SCREEN
   ========================================================= */

function findTeam(name) {
    return tournament.groupA.find(t => t.name === name) ||
           tournament.groupB.find(t => t.name === name);
}

function getFixtureById(id) {
    return tournament.schedule.find(f => f.id === id);
}

function renderTournamentScreen() {

    renderStandingsTable(tournament.groupA, "#groupAStandings");
    renderStandingsTable(tournament.groupB, "#groupBStandings");
    renderScheduleList();
    renderKnockouts();
    renderNextMatchCard();
    renderLeaderboardCard();

    $("tournamentStageLabel").textContent =
        tournament.stage === "group" ? "Group Stage" :
        tournament.stage === "playoffs" ? "Playoffs" :
        tournament.stage === "final" ? "Final Stage" :
        "Completed";
}

function renderStandingsTable(teams, selector) {

    const sorted = [...teams].sort((a, b) => b.points - a.points || b.nrr - a.nrr);
    const qualifiedNames = sorted.slice(0, 2).map(t => t.name);

    let html = `<table><thead><tr>
        <th>#</th><th>Team</th><th>P</th><th>W</th><th>L</th><th>T</th><th>Pts</th><th>NRR</th>
    </tr></thead><tbody>`;

    sorted.forEach((t, i) => {
        const isQualified = tournament.stage !== "group" && qualifiedNames.includes(t.name);
        html += `<tr class="${isQualified ? "qualified" : ""}">
            <td>${i + 1}</td>
            <td>${escapeHTML(t.name)}</td>
            <td>${t.played}</td>
            <td>${t.won}</td>
            <td>${t.lost}</td>
            <td>${t.tied}</td>
            <td>${t.points}</td>
            <td>${t.nrr >= 0 ? "+" : ""}${t.nrr.toFixed(3)}</td>
        </tr>`;
    });

    html += "</tbody></table>";
    document.querySelector(selector).innerHTML = html;
}

function fixtureStatusBadge(fixture) {
    if (fixture.status === "completed") return `<span class="badge green">Completed</span>`;
    if (tournament.liveMatch && tournament.liveMatch.fixtureId === fixture.id) return `<span class="badge gold">Live</span>`;
    return `<span class="badge">Upcoming</span>`;
}

function renderScheduleList() {

    const box = $("scheduleList");
    box.innerHTML = "";

    const groupFixtures = tournament.schedule.filter(f => f.stage === "Group A" || f.stage === "Group B");

    groupFixtures.forEach(fixture => {
        const row = document.createElement("div");
        row.className = "fixture-row" + (fixture.status === "completed" ? " clickable" : "");
        row.innerHTML = `
            <div>
                <div class="fx-teams">${escapeHTML(fixture.teamA)} vs ${escapeHTML(fixture.teamB)}</div>
                <div class="fx-meta">${escapeHTML(fixture.stage)} · Round ${fixture.round}</div>
                ${fixture.result ? `<div class="fx-result">${escapeHTML(fixture.result)}</div>` : ""}
            </div>
            ${fixtureStatusBadge(fixture)}
        `;
        if (fixture.status === "completed") {
            row.addEventListener("click", () => showScorecardModal(fixture));
        }
        box.appendChild(row);
    });
}

function renderKnockouts() {

    const knockoutFixtures = tournament.schedule.filter(f => isKnockoutStage(f.stage));

    if (knockoutFixtures.length === 0) {
        $("knockoutCard").classList.add("hidden");
        return;
    }

    $("knockoutCard").classList.remove("hidden");
    const box = $("knockoutList");
    box.innerHTML = "";

    knockoutFixtures.forEach(fixture => {
        const row = document.createElement("div");
        row.className = "fixture-row" + (fixture.status === "completed" ? " clickable" : "");
        row.innerHTML = `
            <div>
                <div class="fx-teams">${escapeHTML(fixture.teamA)} vs ${escapeHTML(fixture.teamB)}</div>
                <div class="fx-meta">${escapeHTML(fixture.stage)}</div>
                ${fixture.result ? `<div class="fx-result">${escapeHTML(fixture.result)}</div>` : ""}
            </div>
            ${fixtureStatusBadge(fixture)}
        `;
        if (fixture.status === "completed") {
            row.addEventListener("click", () => showScorecardModal(fixture));
        }
        box.appendChild(row);
    });
}

function renderNextMatchCard() {

    $("allDoneCard").classList.add("hidden");
    $("nextMatchCard").classList.add("hidden");

    if (tournament.stage === "complete") {
        $("allDoneCard").classList.remove("hidden");
        return;
    }

    if (tournament.liveMatch) {
        const fixture = getFixtureById(tournament.liveMatch.fixtureId);
        if (fixture && fixture.status !== "completed") {
            $("nextMatchCard").classList.remove("hidden");
            $("nextMatchStage").textContent = `${fixture.stage} · In Progress`;
            $("nextMatchTeamA").textContent = fixture.teamA;
            $("nextMatchTeamB").textContent = fixture.teamB;
            $("btnStartNextMatch").textContent = "▶ Resume Match";
            $("btnStartNextMatch").onclick = () => enterLiveMatch(fixture.id);
            return;
        }
    }

    const next = tournament.schedule.find(f => f.status === "pending");
    if (!next) return;

    $("nextMatchCard").classList.remove("hidden");
    $("nextMatchStage").textContent = `${next.stage} · Next Match`;
    $("nextMatchTeamA").textContent = next.teamA;
    $("nextMatchTeamB").textContent = next.teamB;
    $("btnStartNextMatch").textContent = "▶ Start Match";
    $("btnStartNextMatch").onclick = () => startFixture(next.id);
}

$("btnViewChampion").addEventListener("click", () => showScreen("screenChampion"));

/* =========================================================
   SCORECARD MODAL
   ========================================================= */

function showScorecardModal(fixture) {

    const snap = fixture.matchSnapshot;
    if (!snap) { showAlert("No detailed scorecard saved for this match."); return; }

    let html = `<div style="max-height:55vh; overflow-y:auto; text-align:left;">`;
    html += `<p style="margin-bottom:10px; color: var(--text);"><strong>${escapeHTML(fixture.result || "")}</strong></p>`;

    if (fixture.playerOfMatch) {
        html += `<p style="margin-bottom:10px;">🌟 Player of the Match: <strong>${escapeHTML(fixture.playerOfMatch.name)}</strong> — ${escapeHTML(fixture.playerOfMatch.summary)}</p>`;
    }

    (snap.innings || []).forEach((inn) => {
        html += `<p style="margin-top:14px; font-weight:700;">${escapeHTML(inn.team)} — ${inn.runs}/${inn.wickets} (${inn.overs} ov)</p>`;

        html += `<table style="margin-top:8px;"><thead><tr><th>Batsman</th><th>R</th><th>B</th></tr></thead><tbody>`;
        (inn.batsmen || []).forEach(b => {
            html += `<tr><td style="text-align:left;">${escapeHTML(b.name)} ${b.out ? "" : "*"}</td><td>${b.runs}</td><td>${b.balls}</td></tr>`;
        });
        html += `</tbody></table>`;

        html += `<table style="margin-top:8px;"><thead><tr><th>Bowler</th><th>O</th><th>R</th><th>W</th></tr></thead><tbody>`;
        (inn.bowlers || []).forEach(b => {
            html += `<tr><td style="text-align:left;">${escapeHTML(b.name)}</td><td>${ballsToOvers(b.balls)}</td><td>${b.runs}</td><td>${b.wickets}</td></tr>`;
        });
        html += `</tbody></table>`;
    });

    html += `</div>`;

    showModal({
        title: `${fixture.teamA} vs ${fixture.teamB}`,
        bodyHtml: html,
        buttons: [{ label: "Close", onClick: hideModal }]
    });
}

/* =========================================================
   START / RESUME A LIVE MATCH
   ========================================================= */

function startFixture(fixtureId) {

    const fixture = getFixtureById(fixtureId);
    if (!fixture) return;

    tournament.liveMatch = {
        fixtureId,
        teamA: fixture.teamA,
        teamB: fixture.teamB,
        maxOvers: tournament.maxOvers,
        phase: "toss",
        battingFirst: null,
        inningsNumber: 1,
        battingTeam: "",
        bowlingTeam: "",
        score: 0,
        wickets: 0,
        legalBalls: 0,
        target: null,
        inningsComplete: false,
        matchComplete: false,
        striker: null,
        nonStriker: null,
        batsmen: [],
        bowlers: [],
        currentBowler: null,
        innings: []
    };

    fixture.status = "pending";
    saveTournament();
    enterLiveMatch(fixtureId);
}

function enterLiveMatch(fixtureId) {

    const fixture = getFixtureById(fixtureId);

    $("matchTitle").textContent = `${fixture.teamA} vs ${fixture.teamB}`;
    $("tossTeamAName").textContent = fixture.teamA;
    $("tossTeamBName").textContent = fixture.teamB;
    $("maxOversDisplay").textContent = tournament.maxOvers;

    renderLivePhase();
    showScreen("screenLive");
}

$("btnBackToTournament").addEventListener("click", () => {
    renderTournamentScreen();
    showScreen("screenTournament");
});

/* =========================================================
   LIVE MATCH PHASES
   ========================================================= */

function renderLivePhase() {

    const lm = tournament.liveMatch;
    if (!lm) return;

    $("tossPanel").classList.add("hidden");
    $("openingPlayersPanel").classList.add("hidden");
    $("scoringPanel").classList.add("hidden");

    if (lm.phase === "toss") {
        $("tossPanel").classList.remove("hidden");
        $("inningsStatus").textContent = "Toss";
    } else if (lm.phase === "openingPlayers") {
        $("openingPlayersPanel").classList.remove("hidden");
        $("openStriker").value = "";
        $("openNonStriker").value = "";
        $("openBowler").value = "";
        $("inningsStatus").textContent = `Innings ${lm.inningsNumber} — New Players`;
    } else {
        $("scoringPanel").classList.remove("hidden");
        renderAll();
    }
}

$("tossChooseA").addEventListener("click", () => chooseBattingFirst("A"));
$("tossChooseB").addEventListener("click", () => chooseBattingFirst("B"));

function chooseBattingFirst(which) {
    const lm = tournament.liveMatch;
    const fixture = getFixtureById(lm.fixtureId);

    lm.battingFirst = which;
    lm.battingTeam = which === "A" ? fixture.teamA : fixture.teamB;
    lm.bowlingTeam = which === "A" ? fixture.teamB : fixture.teamA;
    lm.phase = "openingPlayers";

    saveTournament();
    renderLivePhase();
}

$("btnBeginInnings").addEventListener("click", () => {

    const lm = tournament.liveMatch;
    const strikerName = $("openStriker").value.trim() || "Batsman 1";
    const nonStrikerName = $("openNonStriker").value.trim() || "Batsman 2";
    const bowlerName = $("openBowler").value.trim() || "Bowler 1";

    if (strikerName.toLowerCase() === nonStrikerName.toLowerCase()) {
        showAlert("Striker and non-striker must have different names.");
        return;
    }

    const striker = createBatsman(strikerName);
    const nonStriker = createBatsman(nonStrikerName);
    lm.batsmen.push(striker, nonStriker);
    lm.striker = striker;
    lm.nonStriker = nonStriker;

    lm.currentBowler = getOrCreateBowler(bowlerName);
    lm.phase = "scoring";

    saveTournament();
    renderLivePhase();
});

/* =========================================================
   BATSMAN / BOWLER HELPERS
   ========================================================= */

function createBatsman(name) {
    return {
        id: Date.now() + Math.random(),
        name: name.trim(),
        runs: 0,
        balls: 0,
        out: false,
        status: "not out"
    };
}

function getOrCreateBowler(name) {
    const lm = tournament.liveMatch;
    name = name.trim();
    let bowler = lm.bowlers.find(b => b.name.toLowerCase() === name.toLowerCase());
    if (!bowler) {
        bowler = { name, balls: 0, runs: 0, wickets: 0 };
        lm.bowlers.push(bowler);
    }
    return bowler;
}

$("addBatsmanBtn").addEventListener("click", () => {

    const lm = tournament.liveMatch;
    const input = $("newBatsman");
    const name = input.value.trim();

    if (!name) { $("batsmanMessage").textContent = "Enter batsman name."; return; }
    if (lm.wickets >= 10) { $("batsmanMessage").textContent = "All out."; return; }

    const batsman = createBatsman(name);
    lm.batsmen.push(batsman);

    if (!lm.striker || lm.striker.out) {
        lm.striker = batsman;
    } else if (!lm.nonStriker || lm.nonStriker.out) {
        lm.nonStriker = batsman;
    } else {
        $("batsmanMessage").textContent = "Both batting positions are occupied.";
        return;
    }

    input.value = "";
    $("batsmanMessage").textContent = `${name} added successfully.`;
    saveTournament();
    renderAll();
});

$("changeBowlerBtn").addEventListener("click", () => {

    const lm = tournament.liveMatch;
    if (lm.legalBalls % 6 !== 0) {
        showAlert("Bowler can only be changed after an over is completed.");
        return;
    }
    promptNewBowler();
});

function promptNewBowler(afterOver = false) {
    showPromptModal({
        title: afterOver ? "Over Complete — Select Bowler" : "Change Bowler",
        placeholder: "Bowler name",
        onSubmit: (name) => {
            if (!name) name = `Bowler ${tournament.liveMatch.bowlers.length + 1}`;
            tournament.liveMatch.currentBowler = getOrCreateBowler(name);
            saveTournament();
            renderAll();
        }
    });
}

/* =========================================================
   SCORING
   ========================================================= */

document.querySelectorAll("[data-run]").forEach(button => {
    button.addEventListener("click", () => addRuns(parseInt(button.dataset.run)));
});

function canScore() {
    const lm = tournament.liveMatch;
    if (!lm || lm.phase !== "scoring") return false;
    if (lm.matchComplete || lm.inningsComplete) return false;
    if (!lm.currentBowler) { showAlert("Select a bowler first."); return false; }
    if (!lm.striker || !lm.nonStriker) { showAlert("Please enter both batsmen."); return false; }
    return true;
}

function addRuns(runs) {
    if (!canScore()) return;
    const lm = tournament.liveMatch;

    lm.striker.runs += runs;
    lm.striker.balls += 1;
    lm.score += runs;
    lm.currentBowler.runs += runs;
    lm.currentBowler.balls += 1;
    lm.legalBalls++;

    if (runs % 2 === 1) swapStrike();

    finishBall();
}

$("wideBtn").addEventListener("click", () => {
    if (!canScore()) return;
    const lm = tournament.liveMatch;
    lm.score += 1;
    lm.currentBowler.runs += 1;
    if (checkTargetAndFinishIfNeeded()) return;
    saveTournament();
    renderAll();
});

$("noBallBtn").addEventListener("click", () => {
    if (!canScore()) return;
    const lm = tournament.liveMatch;
    lm.score += 1;
    lm.currentBowler.runs += 1;
    if (checkTargetAndFinishIfNeeded()) return;
    saveTournament();
    renderAll();
});

$("byeBtn").addEventListener("click", () => addExtra());
$("legByeBtn").addEventListener("click", () => addExtra());

function addExtra() {
    if (!canScore()) return;
    showPromptModal({
        title: "Extra Runs",
        placeholder: "Runs",
        defaultValue: "1",
        onSubmit: (val) => {
            const amount = parseInt(val);
            if (!amount || amount < 1) return;

            const lm = tournament.liveMatch;
            lm.score += amount;
            lm.striker.balls += 1;
            lm.currentBowler.balls += 1;
            lm.legalBalls++;

            if (amount % 2 === 1) swapStrike();
            finishBall();
        }
    });
}

$("wicketBtn").addEventListener("click", () => {

    if (!canScore()) return;
    const lm = tournament.liveMatch;

    lm.striker.balls += 1;
    lm.striker.out = true;
    lm.striker.status = "out";

    lm.wickets++;
    lm.legalBalls++;
    lm.currentBowler.balls++;
    lm.currentBowler.wickets++;

    if (lm.wickets >= 10) {
        lm.striker = null;
        finishInnings("All Out");
        return;
    }

    lm.striker = null;
    saveTournament();
    renderAll();
    $("batsmanMessage").textContent = "Wicket! Enter the new batsman name below.";
});

function swapStrike() {
    const lm = tournament.liveMatch;
    const temp = lm.striker;
    lm.striker = lm.nonStriker;
    lm.nonStriker = temp;
}

function checkTargetAndFinishIfNeeded() {
    const lm = tournament.liveMatch;
    if (lm.target !== null && lm.score >= lm.target) {
        recordFinalInningsSnapshot("Target Achieved");
        finishMatch(lm.battingTeam, `${lm.battingTeam} won by ${10 - lm.wickets} wicket(s)`);
        return true;
    }
    return false;
}

function finishBall() {

    const lm = tournament.liveMatch;

    if (checkTargetAndFinishIfNeeded()) return;

    if (lm.legalBalls >= lm.maxOvers * 6) {
        finishInnings("Overs Completed");
        return;
    }

    if (lm.legalBalls > 0 && lm.legalBalls % 6 === 0) {
        swapStrike();
        lm.currentBowler = null;
        saveTournament();
        renderAll();
        promptNewBowler(true);
        return;
    }

    saveTournament();
    renderAll();
}

/* =========================================================
   INNINGS / MATCH COMPLETION
   ========================================================= */

function ballsToOvers(balls) {
    return Math.floor(balls / 6) + "." + (balls % 6);
}

function decimalOvers(balls) {
    return balls / 6;
}

function recordFinalInningsSnapshot(reason) {

    const lm = tournament.liveMatch;
    if (lm.inningsComplete) return;

    lm.inningsComplete = true;

    // For NRR: if all out before full overs, credit the full allotted overs.
    const nrrBalls = (lm.wickets >= 10) ? lm.maxOvers * 6 : lm.legalBalls;

    lm.innings.push({
        team: lm.battingTeam,
        runs: lm.score,
        wickets: lm.wickets,
        balls: lm.legalBalls,
        overs: ballsToOvers(lm.legalBalls),
        nrrBalls,
        reason,
        batsmen: JSON.parse(JSON.stringify(lm.batsmen)),
        bowlers: JSON.parse(JSON.stringify(lm.bowlers))
    });
}

function finishInnings(reason) {

    const lm = tournament.liveMatch;
    if (lm.inningsComplete) return;
    recordFinalInningsSnapshot(reason);

    if (lm.inningsNumber === 1) {

        lm.target = lm.score + 1;
        lm.inningsNumber = 2;

        const prevBatting = lm.battingTeam;
        lm.battingTeam = lm.bowlingTeam;
        lm.bowlingTeam = prevBatting;

        saveTournament();

        showModal({
            title: "Innings 1 Complete",
            bodyHtml: `<p>${escapeHTML(lm.innings[0].team)} scored <strong>${lm.innings[0].runs}/${lm.innings[0].wickets}</strong> (${lm.innings[0].overs} ov).</p>
                       <p style="margin-top:8px;">Target for ${escapeHTML(lm.battingTeam)}: <strong>${lm.target}</strong></p>`,
            buttons: [{
                label: "Start Innings 2",
                onClick: () => {
                    hideModal();
                    startSecondInnings();
                }
            }]
        });
        return;
    }

    compareScoresAndFinish();
}

function startSecondInnings() {

    const lm = tournament.liveMatch;
    lm.score = 0;
    lm.wickets = 0;
    lm.legalBalls = 0;
    lm.striker = null;
    lm.nonStriker = null;
    lm.batsmen = [];
    lm.bowlers = [];
    lm.currentBowler = null;
    lm.inningsComplete = false;
    lm.phase = "openingPlayers";

    saveTournament();
    renderLivePhase();
}

function compareScoresAndFinish() {

    const lm = tournament.liveMatch;
    const first = lm.innings[0];
    const second = lm.innings[1];

    if (second.runs === first.runs) {
        finishMatch(null, "Match Tied");
        return;
    }

    if (second.runs > first.runs) {
        finishMatch(lm.battingTeam, `${lm.battingTeam} won by ${10 - lm.wickets} wicket(s)`);
        return;
    }

    const margin = first.runs - second.runs;
    finishMatch(first.team, `${first.team} won by ${margin} run(s)`);
}

function finishMatch(winnerName, resultText) {

    const lm = tournament.liveMatch;
    const fixture = getFixtureById(lm.fixtureId);
    const isKnockout = isKnockoutStage(fixture.stage);

    lm.matchComplete = true;
    lm.inningsComplete = true;
    saveTournament();
    renderAll();

    const finalize = (finalWinner, finalResultText) => {

        fixture.status = "completed";
        fixture.winner = finalWinner;
        fixture.result = finalResultText;
        fixture.matchSnapshot = JSON.parse(JSON.stringify(lm));
        fixture.playerOfMatch = computePlayerOfMatch(lm.innings);

        if (fixture.stage === "Group A" || fixture.stage === "Group B") {
            recomputeGroupStandings();
        }

        sendMatchToSheet(fixture, lm);

        tournament.liveMatch = null;
        checkProgressionAndAdvance();
        if (tournament.stage === "complete") {
            computeTournamentAwards();
        }
        saveTournament();

        const potmHtml = fixture.playerOfMatch
            ? `<p style="margin-top:10px;">🌟 Player of the Match: <strong>${escapeHTML(fixture.playerOfMatch.name)}</strong><br><span style="font-size:12.5px;">${escapeHTML(fixture.playerOfMatch.summary)}</span></p>`
            : "";

        showModal({
            title: "Match Complete 🏆",
            bodyHtml: `<p>${escapeHTML(finalResultText)}</p>${potmHtml}`,
            buttons: [{
                label: "View Tournament",
                onClick: () => {
                    hideModal();
                    if (tournament.stage === "complete" && fixture.stage === "Final") {
                        renderChampionScreen();
                        showScreen("screenChampion");
                    } else {
                        renderTournamentScreen();
                        showScreen("screenTournament");
                    }
                }
            }]
        });
    };

    if (winnerName === null && isKnockout) {
        showTieBreakModal(fixture, (pickedWinner) => {
            finalize(pickedWinner, `${resultText} — ${pickedWinner} advance (tie-breaker)`);
        });
    } else {
        finalize(winnerName || "Tie", resultText);
    }
}

/* =========================================================
   STANDINGS / NRR — FULL RECOMPUTE
   Rebuilt from every completed group fixture's saved snapshot,
   so it is idempotent and self-healing.
   ========================================================= */

function resetTeamStats(team) {
    team.played = 0; team.won = 0; team.lost = 0; team.tied = 0; team.points = 0;
    team.runsFor = 0; team.ballsFor = 0;
    team.runsAgainst = 0; team.ballsAgainst = 0;
    team.nrr = 0;
}

function applyMatchToStandings(fixture, teams) {

    if (!fixture.matchSnapshot || !fixture.matchSnapshot.innings) return;
    const innings = fixture.matchSnapshot.innings;

    const teamAInnings = innings.find(i => i.team === fixture.teamA);
    const teamBInnings = innings.find(i => i.team === fixture.teamB);
    if (!teamAInnings || !teamBInnings) return;

    const teamAObj = teams.find(t => t.name === fixture.teamA);
    const teamBObj = teams.find(t => t.name === fixture.teamB);
    if (!teamAObj || !teamBObj) {
        console.warn("recomputeGroupStandings: could not find team object for", fixture.teamA, fixture.teamB);
        return;
    }

    teamAObj.played++;
    teamBObj.played++;

    if (fixture.winner === fixture.teamA) {
        teamAObj.won++; teamAObj.points += 2;
        teamBObj.lost++;
    } else if (fixture.winner === fixture.teamB) {
        teamBObj.won++; teamBObj.points += 2;
        teamAObj.lost++;
    } else {
        teamAObj.tied++; teamAObj.points += 1;
        teamBObj.tied++; teamBObj.points += 1;
    }

    teamAObj.runsFor += teamAInnings.runs;
    teamAObj.ballsFor += teamAInnings.nrrBalls;
    teamAObj.runsAgainst += teamBInnings.runs;
    teamAObj.ballsAgainst += teamBInnings.nrrBalls;

    teamBObj.runsFor += teamBInnings.runs;
    teamBObj.ballsFor += teamBInnings.nrrBalls;
    teamBObj.runsAgainst += teamAInnings.runs;
    teamBObj.ballsAgainst += teamAInnings.nrrBalls;
}

function recomputeGroupStandings() {

    if (!tournament) return;

    [
        { teams: tournament.groupA, stage: "Group A" },
        { teams: tournament.groupB, stage: "Group B" }
    ].forEach(({ teams, stage }) => {

        teams.forEach(resetTeamStats);

        const fixtures = tournament.schedule.filter(f => f.stage === stage && f.status === "completed");
        fixtures.forEach(fixture => applyMatchToStandings(fixture, teams));

        teams.forEach(t => {
            if (t.ballsFor > 0 && t.ballsAgainst > 0) {
                t.nrr = (t.runsFor / decimalOvers(t.ballsFor)) - (t.runsAgainst / decimalOvers(t.ballsAgainst));
            } else {
                t.nrr = 0;
            }
        });
    });
}

/* =========================================================
   PLAYER STATS — LEADERBOARDS, PLAYER OF MATCH / TOURNAMENT
   ========================================================= */

function mergePlayerFigures(inningsList) {

    const players = {};

    const ensure = (name) => {
        if (!players[name]) {
            players[name] = { name, runs: 0, balls: 0, outs: 0, wickets: 0, runsConceded: 0, ballsBowled: 0, matches: 0 };
        }
        return players[name];
    };

    (inningsList || []).forEach(inn => {
        (inn.batsmen || []).forEach(b => {
            const p = ensure(b.name);
            p.runs += b.runs;
            p.balls += b.balls;
            if (b.out) p.outs += 1;
        });
        (inn.bowlers || []).forEach(b => {
            const p = ensure(b.name);
            p.wickets += b.wickets;
            p.runsConceded += b.runs;
            p.ballsBowled += b.balls;
        });
    });

    return players;
}

function battingImpact(p) {
    if (p.balls <= 0) return 0;
    const strikeRate = (p.runs / p.balls) * 100;
    const paceBonus = p.balls >= 6 ? Math.max(0, (strikeRate - 100) / 8) : 0;
    return p.runs + paceBonus;
}

function bowlingImpact(p) {
    if (p.ballsBowled <= 0) return 0;
    const economy = p.runsConceded / (p.ballsBowled / 6);
    const economyBonus = p.ballsBowled >= 6 ? Math.max(0, (8 - economy)) * 2.2 : 0;
    return (p.wickets * 22) + economyBonus;
}

function impactScore(p) {
    return battingImpact(p) + bowlingImpact(p);
}

function computePlayerOfMatch(inningsList) {

    const players = mergePlayerFigures(inningsList);
    const list = Object.values(players);
    if (list.length === 0) return null;

    list.sort((a, b) => impactScore(b) - impactScore(a));
    const best = list[0];

    const parts = [];
    if (best.runs > 0) parts.push(`${best.runs} run(s) off ${best.balls} ball(s)`);
    if (best.wickets > 0) parts.push(`${best.wickets} wicket(s) for ${best.runsConceded}`);

    return { name: best.name, summary: parts.join(" & ") || "-" };
}

function computeLeaderboards() {

    const allInnings = [];
    tournament.schedule.forEach(f => {
        if (f.status === "completed" && f.matchSnapshot && f.matchSnapshot.innings) {
            f.matchSnapshot.innings.forEach(inn => allInnings.push(inn));
        }
    });

    const merged = mergePlayerFigures(allInnings);
    const list = Object.values(merged);

    const batting = [...list]
        .filter(p => p.balls > 0)
        .sort((a, b) => b.runs - a.runs || (b.runs / b.balls) - (a.runs / a.balls));

    const bowling = [...list]
        .filter(p => p.ballsBowled > 0)
        .sort((a, b) => b.wickets - a.wickets || (a.runsConceded / (a.ballsBowled / 6)) - (b.runsConceded / (b.ballsBowled / 6)));

    return { batting, bowling, all: list };
}

function computeTournamentAwards() {

    const { batting, bowling, all } = computeLeaderboards();

    tournament.bestBatsman = batting[0] || null;
    tournament.bestBowler = bowling[0] || null;

    const rankedByImpact = [...all].sort((a, b) => impactScore(b) - impactScore(a));
    tournament.playerOfTournament = rankedByImpact[0] || null;
}

function renderLeaderboardCard() {

    const { batting, bowling } = computeLeaderboards();
    const card = $("leaderboardCard");

    if (batting.length === 0 && bowling.length === 0) {
        card.classList.add("hidden");
        return;
    }
    card.classList.remove("hidden");

    const topBatting = batting.slice(0, 5);
    const topBowling = bowling.slice(0, 5);

    let battingHtml = `<table><thead><tr><th>Batsman</th><th>R</th><th>B</th><th>SR</th></tr></thead><tbody>`;
    topBatting.forEach(p => {
        const sr = p.balls > 0 ? (p.runs / p.balls * 100).toFixed(1) : "0.0";
        battingHtml += `<tr><td>${escapeHTML(p.name)}</td><td>${p.runs}</td><td>${p.balls}</td><td>${sr}</td></tr>`;
    });
    battingHtml += `</tbody></table>`;

    let bowlingHtml = `<table><thead><tr><th>Bowler</th><th>O</th><th>R</th><th>W</th></tr></thead><tbody>`;
    topBowling.forEach(p => {
        bowlingHtml += `<tr><td>${escapeHTML(p.name)}</td><td>${ballsToOvers(p.ballsBowled)}</td><td>${p.runsConceded}</td><td>${p.wickets}</td></tr>`;
    });
    bowlingHtml += `</tbody></table>`;

    $("leaderboardBatting").innerHTML = battingHtml;
    $("leaderboardBowling").innerHTML = bowlingHtml;
}

/* =========================================================
   PROGRESSION
   Group Stage
     -> Qualifier 1  : Group A 1st vs Group B 1st (winner -> Final, loser -> Qualifier 2)
     -> Eliminator   : Group A 2nd vs Group B 2nd (loser out, winner -> Qualifier 2)
     -> Qualifier 2  : Q1 loser vs Eliminator winner (winner -> Final)
     -> Final        : Q1 winner vs Q2 winner
   ========================================================= */

function fixtureLoser(f) {
    return f.winner === f.teamA ? f.teamB : f.teamA;
}

function checkProgressionAndAdvance() {

    const groupFixtures = tournament.schedule.filter(f => f.stage === "Group A" || f.stage === "Group B");
    const groupDone = groupFixtures.length > 0 && groupFixtures.every(f => f.status === "completed");

    if (groupDone && !getFixtureById("Q1")) {
        generatePlayoffs();
        tournament.stage = "playoffs";
        return;
    }

    const q1 = getFixtureById("Q1");
    const elim = getFixtureById("ELIM");
    const q2 = getFixtureById("Q2");

    if (q1 && elim && q1.status === "completed" && elim.status === "completed" && !q2) {
        tournament.schedule.push(
            createFixture("Q2", "Qualifier 2", null, fixtureLoser(q1), elim.winner)
        );
        return;
    }

    const final = getFixtureById("FINAL");
    const q2now = getFixtureById("Q2");

    if (q1 && q2now && q1.status === "completed" && q2now.status === "completed" && !final) {
        tournament.schedule.push(
            createFixture("FINAL", "Final", null, q1.winner, q2now.winner)
        );
        tournament.stage = "final";
        return;
    }

    if (final && final.status === "completed") {
        tournament.champion = final.winner;
        tournament.stage = "complete";
    }
}

function generatePlayoffs() {

    const sortedA = [...tournament.groupA].sort((a, b) => b.points - a.points || b.nrr - a.nrr);
    const sortedB = [...tournament.groupB].sort((a, b) => b.points - a.points || b.nrr - a.nrr);

    if (sortedA.length < 2 || sortedB.length < 2) return;

    tournament.schedule.push(createFixture("Q1", "Qualifier 1", null, sortedA[0].name, sortedB[0].name));
    tournament.schedule.push(createFixture("ELIM", "Eliminator", null, sortedA[1].name, sortedB[1].name));
}

/* =========================================================
   CHAMPION SCREEN
   ========================================================= */

function renderChampionScreen() {

    const final = getFixtureById("FINAL");
    $("championName").textContent = tournament.champion || "-";
    if (final) {
        $("championSummary").textContent = final.result || "";
    }

    if (!tournament.playerOfTournament) computeTournamentAwards();

    renderAwardCard("awardPlayerOfTournament", "🌟 Player of the Tournament", tournament.playerOfTournament, p =>
        `${p.runs} run(s)${p.wickets ? `, ${p.wickets} wicket(s)` : ""}`);

    renderAwardCard("awardBestBatsman", "🏏 Best Batsman", tournament.bestBatsman, p =>
        `${p.runs} run(s) off ${p.balls} ball(s)`);

    renderAwardCard("awardBestBowler", "🎳 Best Bowler", tournament.bestBowler, p =>
        `${p.wickets} wicket(s), ${p.runsConceded} run(s) conceded`);
}

function renderAwardCard(elementId, label, player, summaryFn) {
    const el = $(elementId);
    if (!el) return;
    if (!player) { el.innerHTML = ""; return; }
    el.innerHTML = `
        <div class="award-label">${label}</div>
        <div class="award-name">${escapeHTML(player.name)}</div>
        <div class="award-stat">${escapeHTML(summaryFn(player))}</div>
    `;
}

$("btnNewTournamentFromChampion").addEventListener("click", () => {
    showConfirm({
        title: "Start New Tournament",
        message: "This will clear the current tournament and all its results. Continue?",
        confirmLabel: "Start New",
        onConfirm: () => {
            localStorage.removeItem(STORAGE_KEY);
            location.reload();
        }
    });
});

/* =========================================================
   GOOGLE SHEETS SYNC
   ========================================================= */

function sendMatchToSheet(fixture, lm) {

    if (!tournament.sheetsUrl) return;

    const allBatting = [];
    const allBowling = [];
    lm.innings.forEach(inn => {
        (inn.batsmen || []).forEach(b => allBatting.push({ team: inn.team, name: b.name, runs: b.runs, balls: b.balls, out: b.out }));
        (inn.bowlers || []).forEach(b => allBowling.push({ team: inn.team, name: b.name, overs: ballsToOvers(b.balls), runs: b.runs, wickets: b.wickets }));
    });

    const payload = {
        type: "match",
        timestamp: new Date().toISOString(),
        stage: fixture.stage,
        round: fixture.round,
        teamA: fixture.teamA,
        teamB: fixture.teamB,
        result: fixture.result,
        winner: fixture.winner,
        playerOfMatch: fixture.playerOfMatch ? fixture.playerOfMatch.name : "",
        maxOvers: tournament.maxOvers,
        innings: lm.innings.map(i => ({ team: i.team, runs: i.runs, wickets: i.wickets, overs: i.overs, reason: i.reason })),
        batting: allBatting,
        bowling: allBowling
    };

    fetch(tournament.sheetsUrl, {
        method: "POST",
        mode: "no-cors",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify(payload)
    }).catch(err => console.error("Google Sheet sync failed:", err));
}

function sendStandingsSnapshotToSheet() {

    if (!tournament.sheetsUrl) return;

    const payload = {
        type: "standings",
        timestamp: new Date().toISOString(),
        groupA: tournament.groupA,
        groupB: tournament.groupB
    };

    fetch(tournament.sheetsUrl, {
        method: "POST",
        mode: "no-cors",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify(payload)
    }).catch(err => console.error("Google Sheet sync failed:", err));
}

/* =========================================================
   RENDER (LIVE SCORING VIEW)
   ========================================================= */

function renderAll() {

    const lm = tournament.liveMatch;
    if (!lm || lm.phase !== "scoring") return;

    const fixture = getFixtureById(lm.fixtureId);

    $("battingTeamName").textContent = lm.battingTeam;
    $("runs").textContent = lm.score;
    $("wickets").textContent = lm.wickets;
    $("overs").textContent = ballsToOvers(lm.legalBalls);
    $("target").textContent = lm.target || "-";

    if (lm.target !== null) {
        const remainingRuns = Math.max(lm.target - lm.score, 0);
        const ballsLeft = Math.max(lm.maxOvers * 6 - lm.legalBalls, 0);
        $("required").textContent = `${remainingRuns} run(s) needed from ${ballsLeft} ball(s)`;
    } else {
        $("required").textContent = "-";
    }

    $("strikerName").textContent = lm.striker ? lm.striker.name : "New Batsman";
    $("nonStrikerName").textContent = lm.nonStriker ? lm.nonStriker.name : "Not Selected";
    $("strikerRuns").textContent = lm.striker ? lm.striker.runs : 0;
    $("strikerBalls").textContent = lm.striker ? lm.striker.balls : 0;
    $("nonStrikerRuns").textContent = lm.nonStriker ? lm.nonStriker.runs : 0;
    $("nonStrikerBalls").textContent = lm.nonStriker ? lm.nonStriker.balls : 0;

    $("bowlerName").textContent = lm.currentBowler ? lm.currentBowler.name : "Select Bowler";
    $("bowlerRuns").textContent = lm.currentBowler ? lm.currentBowler.runs : 0;
    $("bowlerWickets").textContent = lm.currentBowler ? lm.currentBowler.wickets : 0;
    $("bowlerOvers").textContent = lm.currentBowler ? ballsToOvers(lm.currentBowler.balls) : "0.0";

    const over = Math.floor(lm.legalBalls / 6) + 1;
    const ball = (lm.legalBalls % 6) + 1;
    const oversDone = lm.legalBalls >= lm.maxOvers * 6;

    $("currentOver").textContent = oversDone ? lm.maxOvers : over;
    $("currentBall").textContent = oversDone ? 6 : ball;
    $("ballsRemaining").textContent = Math.max(lm.maxOvers * 6 - lm.legalBalls, 0);

    if (lm.matchComplete) {
        $("inningsStatus").textContent = "🏆 Match Completed";
    } else if (lm.inningsComplete) {
        $("inningsStatus").textContent = "Innings Completed";
    } else {
        $("inningsStatus").textContent = `${fixture ? fixture.stage : ""} — Innings ${lm.inningsNumber}`;
    }

    renderBattingTable(lm);
    renderBowlingTable(lm);
    renderInningsHistory(lm);
}

function renderBattingTable(lm) {

    const tbody = $("battingTable");
    tbody.innerHTML = "";

    lm.batsmen.forEach(player => {
        const tr = document.createElement("tr");
        const strike = lm.striker === player ? " ⭐" : "";
        const sr = player.balls > 0 ? (player.runs / player.balls * 100).toFixed(2) : "0.00";
        tr.innerHTML = `
            <td>${escapeHTML(player.name)}${strike}</td>
            <td>${player.runs}</td>
            <td>${player.balls}</td>
            <td>${sr}</td>
            <td class="${player.out ? "status-out" : "status-notout"}">${player.out ? "OUT" : "NOT OUT"}</td>
        `;
        tbody.appendChild(tr);
    });
}

function renderBowlingTable(lm) {

    const tbody = $("bowlingTable");
    tbody.innerHTML = "";

    lm.bowlers.forEach(bowler => {
        const tr = document.createElement("tr");
        tr.innerHTML = `
            <td>${escapeHTML(bowler.name)}</td>
            <td>${ballsToOvers(bowler.balls)}</td>
            <td>${bowler.runs}</td>
            <td>${bowler.wickets}</td>
        `;
        tbody.appendChild(tr);
    });
}

function renderInningsHistory(lm) {

    const box = $("inningsHistory");
    box.innerHTML = "";

    lm.innings.forEach((innings, index) => {
        const row = document.createElement("div");
        row.className = "fixture-row";
        row.innerHTML = `
            <div>
                <div class="fx-teams">Innings ${index + 1} — ${escapeHTML(innings.team)}</div>
                <div class="fx-meta">${innings.runs}/${innings.wickets} in ${innings.overs} overs — ${escapeHTML(innings.reason)}</div>
            </div>
        `;
        box.appendChild(row);
    });
}

/* =========================================================
   SETTINGS — GOOGLE SHEET URL + BACKGROUND PHOTO (+ REVERSE)
   Photo is stored in IndexedDB (compressed), with a legacy
   localStorage fallback.
   ========================================================= */

const BG_IMAGE_KEY = "spds_bg_image_v1";
const BG_DB_NAME = "spds_bg_store";
const BG_DB_VERSION = 1;
const BG_STORE_NAME = "images";
const BG_RECORD_KEY = "background";
const BG_FLIP_KEY = "spds_bg_flip";

function applyBgFlip() {
    const layer = $("bgLayer");
    if (layer) layer.classList.toggle("flipped", localStorage.getItem(BG_FLIP_KEY) === "1");
}

function toggleBgFlip() {
    localStorage.setItem(BG_FLIP_KEY, localStorage.getItem(BG_FLIP_KEY) === "1" ? "0" : "1");
    applyBgFlip();
}

function openBgDB() {
    return new Promise((resolve, reject) => {
        if (!window.indexedDB) { reject(new Error("IndexedDB not available")); return; }
        const req = indexedDB.open(BG_DB_NAME, BG_DB_VERSION);
        req.onupgradeneeded = () => {
            const db = req.result;
            if (!db.objectStoreNames.contains(BG_STORE_NAME)) db.createObjectStore(BG_STORE_NAME);
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}

function saveBgImageBlob(blob) {
    return openBgDB().then(db => new Promise((resolve, reject) => {
        const tx = db.transaction(BG_STORE_NAME, "readwrite");
        tx.objectStore(BG_STORE_NAME).put(blob, BG_RECORD_KEY);
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => reject(tx.error);
    })).catch(err => {
        console.error("Background photo: IndexedDB save failed", err);
        return false;
    });
}

function loadBgImageBlob() {
    return openBgDB().then(db => new Promise((resolve, reject) => {
        const tx = db.transaction(BG_STORE_NAME, "readonly");
        const req = tx.objectStore(BG_STORE_NAME).get(BG_RECORD_KEY);
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => reject(req.error);
    })).catch(() => null);
}

function deleteBgImageBlob() {
    return openBgDB().then(db => new Promise((resolve) => {
        const tx = db.transaction(BG_STORE_NAME, "readwrite");
        tx.objectStore(BG_STORE_NAME).delete(BG_RECORD_KEY);
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => resolve(false);
    })).catch(() => false);
}

function blobToDataUrl(blob) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
}

function compressImageFile(file, maxDim = 1600, quality = 0.82) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(new Error("Could not read file"));
        reader.onload = (e) => {
            const img = new Image();
            img.onerror = () => reject(new Error("Could not decode image"));
            img.onload = () => {
                let width = img.naturalWidth;
                let height = img.naturalHeight;
                if (width > maxDim || height > maxDim) {
                    const scale = maxDim / Math.max(width, height);
                    width = Math.round(width * scale);
                    height = Math.round(height * scale);
                }
                const canvas = document.createElement("canvas");
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext("2d");
                ctx.drawImage(img, 0, 0, width, height);
                canvas.toBlob(blob => {
                    if (blob) resolve(blob); else reject(new Error("Could not encode image"));
                }, "image/jpeg", quality);
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    });
}

function applyBackgroundImage(dataUrl) {
    const layer = $("bgLayer");
    if (!layer) return;
    if (dataUrl) {
        layer.style.backgroundImage = `url(${dataUrl})`;
        document.body.classList.add("has-bg-image");
    } else {
        layer.style.backgroundImage = "";
        document.body.classList.remove("has-bg-image");
    }
}

async function loadBackgroundImage() {
    const blob = await loadBgImageBlob();
    if (blob) {
        try {
            const dataUrl = await blobToDataUrl(blob);
            applyBackgroundImage(dataUrl);
            return;
        } catch (e) {
            console.error("Background photo: could not read stored image", e);
        }
    }
    const legacy = localStorage.getItem(BG_IMAGE_KEY);
    if (legacy) applyBackgroundImage(legacy);
}

async function handleBackgroundUpload(file) {

    if (!file) return;
    if (!file.type.startsWith("image/")) { showAlert("Please choose an image file."); return; }
    if (file.size > 20 * 1024 * 1024) { showAlert("Image is too large. Please choose a photo under 20MB."); return; }

    try {
        const compressed = await compressImageFile(file);
        const saved = await saveBgImageBlob(compressed);
        const dataUrl = await blobToDataUrl(compressed);

        if (saved) {
            localStorage.removeItem(BG_IMAGE_KEY);
            applyBackgroundImage(dataUrl);
        } else {
            try {
                localStorage.setItem(BG_IMAGE_KEY, dataUrl);
                applyBackgroundImage(dataUrl);
            } catch (err) {
                showAlert("Could not save this photo permanently on this device. Try a smaller image.");
            }
        }
    } catch (err) {
        console.error("Background photo upload failed:", err);
        showAlert("Could not process this image. Please try a different photo.");
    }
}

async function removeBackgroundImage() {
    await deleteBgImageBlob();
    localStorage.removeItem(BG_IMAGE_KEY);
    localStorage.removeItem(BG_FLIP_KEY);
    applyBackgroundImage(null);
    applyBgFlip();
}

$("settingsBtn").addEventListener("click", () => {

    showModal({
        title: "⚙️ Settings",
        bodyHtml: `
            <div class="field">
                <label>Google Sheet Web App URL</label>
                <input id="modalSheetsUrl" type="text" placeholder="https://script.google.com/macros/s/xxxxx/exec" value="${escapeHTML(tournament ? tournament.sheetsUrl || "" : "")}">
                <small>Every completed match is sent here automatically.</small>
            </div>
            <div class="field">
                <label>Background Photo</label>
                <input id="modalBgFile" type="file" accept="image/*">
                <small>Saved permanently on this device/browser.</small>
            </div>
            <div class="btn-row">
                <button id="modalFlipBg" type="button" class="secondary-btn full-width">↔ Reverse Background Photo</button>
                <button id="modalRemoveBg" type="button" class="ghost-btn full-width">Remove Background Photo</button>
            </div>
        `,
        buttons: [
            { label: "Cancel", className: "secondary-btn", onClick: hideModal },
            {
                label: "Save",
                onClick: () => {
                    const url = $("modalSheetsUrl").value.trim();
                    if (tournament) {
                        tournament.sheetsUrl = url;
                        saveTournament();
                    }
                    hideModal();
                }
            }
        ]
    });

    const fileInput = $("modalBgFile");
    if (fileInput) fileInput.addEventListener("change", (e) => handleBackgroundUpload(e.target.files[0]));

    const flipBtn = $("modalFlipBg");
    if (flipBtn) flipBtn.addEventListener("click", toggleBgFlip);

    const removeBtn = $("modalRemoveBg");
    if (removeBtn) removeBtn.addEventListener("click", () => removeBackgroundImage());
});

/* =========================================================
   RESET
   ========================================================= */

$("resetBtn").addEventListener("click", () => {
    showConfirm({
        title: "Reset Tournament",
        message: "This clears everything — teams, schedule, scores. This cannot be undone.",
        confirmLabel: "Reset",
        onConfirm: () => {
            localStorage.removeItem(STORAGE_KEY);
            location.reload();
        }
    });
});

/* =========================================================
   ESCAPE HTML
   ========================================================= */

function escapeHTML(value) {
    return String(value).replace(/[&<>"']/g, char => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    })[char]);
}

/* =========================================================
   INITIAL LOAD
   ========================================================= */

function init() {

    loadTournament();
    loadBackgroundImage();
    applyBgFlip();

    if (tournament && tournament.schedule && tournament.schedule.length && tournament.groupA && tournament.groupB) {
        recomputeGroupStandings();
        if (tournament.stage === "complete") {
            computeTournamentAwards();
        }
        saveTournament();
    }

    if (tournament.stage === "setup") {
        showScreen("screenSetup");
    } else if (tournament.stage === "teams") {
        renderTeamNameInputs(tournament.numTeams);
        showScreen("screenTeams");
    } else if (tournament.stage === "complete") {
        renderChampionScreen();
        showScreen("screenChampion");
    } else {
        renderTournamentScreen();
        if (tournament.liveMatch) {
            enterLiveMatch(tournament.liveMatch.fixtureId);
        } else {
            showScreen("screenTournament");
        }
    }
}

init();
