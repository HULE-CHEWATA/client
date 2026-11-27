import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ensureAudio, playCallSound } from "./sound.js";

function getInitData() {
  const tg = window.Telegram?.WebApp;
  if (tg) {
    tg.ready?.();
    tg.expand?.();
    if (tg.initData) return tg.initData;
  }
  return "";
}

function getWinningCoords(matrix, markedSet) {
  const winners = new Set();
  const isHit = (r, c) => matrix[r][c] === 0 || markedSet.has(matrix[r][c]);

  for (let r = 0; r < 5; r += 1) {
    if ([0, 1, 2, 3, 4].every((c) => isHit(r, c))) {
      for (let c = 0; c < 5; c += 1) winners.add(`${r}-${c}`);
    }
  }

  for (let c = 0; c < 5; c += 1) {
    if ([0, 1, 2, 3, 4].every((r) => isHit(r, c))) {
      for (let r = 0; r < 5; r += 1) winners.add(`${r}-${c}`);
    }
  }

  if ([0, 1, 2, 3, 4].every((i) => isHit(i, i))) {
    for (let i = 0; i < 5; i += 1) winners.add(`${i}-${i}`);
  }

  if ([0, 1, 2, 3, 4].every((i) => isHit(i, 4 - i))) {
    for (let i = 0; i < 5; i += 1) winners.add(`${i}-${4 - i}`);
  }

  return winners;
}

function BingoGrid({ matrix, markedSet, showWinningLines = false }) {
  const winningCoords = useMemo(
    () => (showWinningLines ? getWinningCoords(matrix, markedSet) : new Set()),
    [matrix, markedSet, showWinningLines],
  );

  return (
    <div className="card-grid-wrap">
      {["B", "I", "N", "G", "O"].map((ch) => (
        <div key={ch} className="bingo-hdr">
          {ch}
        </div>
      ))}
      {matrix.flatMap((row, rIdx) =>
        row.map((val, cIdx) => {
          const isFree = val === 0;
          const isMarked = isFree || markedSet.has(val);
          const isWinning = winningCoords.has(`${rIdx}-${cIdx}`);
          const cls = [
            "cell",
            isMarked ? "marked" : "",
            isWinning ? "winning" : "",
          ]
            .filter(Boolean)
            .join(" ");

          return (
            <div key={`${rIdx}-${cIdx}`} className={cls}>
              {isFree ? "FREE" : val}
            </div>
          );
        }),
      )}
    </div>
  );
}

export default function App() {
  const initData = useMemo(() => getInitData(), []);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [state, setState] = useState(null);
  const [cardsMap, setCardsMap] = useState({});
  const [selectedCardNo, setSelectedCardNo] = useState(null);
  const [joining, setJoining] = useState(false);
  const [statusMsg, setStatusMsg] = useState("");

  const lastSpokenCountRef = useRef(0);
  const soundEnabledRef = useRef(soundEnabled);
  soundEnabledRef.current = soundEnabled;

  const headers = useMemo(
    () => ({
      "Content-Type": "application/json",
      "X-Telegram-Init-Data": initData,
    }),
    [initData],
  );

  const fetchState = useCallback(async () => {
    try {
      const res = await fetch("/api/state", { headers });
      if (res.ok) {
        const data = await res.json();
        setState(data);
        setStatusMsg((prev) =>
          prev === "Open this Mini App inside Telegram to play." ? "" : prev,
        );
      } else if (res.status === 401) {
        setStatusMsg("Open this Mini App inside Telegram to play.");
      }
    } catch {
      setStatusMsg("Connection interrupted. Retrying...");
    }
  }, [headers]);

  useEffect(() => {
    let active = true;

    (async () => {
      try {
        const res = await fetch("/api/cards", { headers });
        if (res.ok && active) {
          const data = await res.json();
          if (data.cards) setCardsMap(data.cards);
        }
      } catch {
        // handled by state polling
      }
      if (active) await fetchState();
    })();

    const id = window.setInterval(() => {
      fetchState();
    }, 1500);

    return () => {
      active = false;
      window.clearInterval(id);
    };
  }, [fetchState, headers]);

  useEffect(() => {
    if (!state) return;
    const calledList = state.called || [];
    if (calledList.length > lastSpokenCountRef.current) {
      if (lastSpokenCountRef.current > 0 || state.state === "running") {
        const newest = calledList[calledList.length - 1];
        playCallSound(newest.num, soundEnabledRef.current);
      }
      lastSpokenCountRef.current = calledList.length;
    } else if (calledList.length === 0) {
      lastSpokenCountRef.current = 0;
    }
  }, [state]);

  const takenSet = useMemo(
    () => new Set(state?.taken_cards || []),
    [state?.taken_cards],
  );
  const markedSet = useMemo(
    () => new Set(state?.marked_set || []),
    [state?.marked_set],
  );
  const cardCount = state?.card_count || 200;
  const canPick = Boolean(
    state && state.state === "lobby" && state.my_card_no == null,
  );

  useEffect(() => {
    if (selectedCardNo != null && takenSet.has(selectedCardNo)) {
      setSelectedCardNo(null);
    }
  }, [selectedCardNo, takenSet]);

  const cardNumbers = useMemo(
    () => Array.from({ length: cardCount }, (_, idx) => idx + 1),
    [cardCount],
  );

  const availableCardNumbers = useMemo(
    () => cardNumbers.filter((n) => !takenSet.has(n)),
    [cardNumbers, takenSet],
  );

  function handleToggleSound() {
    const next = !soundEnabled;
    setSoundEnabled(next);
    if (next) {
      ensureAudio(true);
      playCallSound(1, true);
    }
  }

  function handleRandomCard() {
    ensureAudio(soundEnabledRef.current);
    if (!canPick || availableCardNumbers.length === 0) return;
    const pick =
      availableCardNumbers[
        Math.floor(Math.random() * availableCardNumbers.length)
      ];
    setSelectedCardNo(pick);
  }

  async function handleJoin() {
    ensureAudio(soundEnabledRef.current);
    if (!canPick || selectedCardNo == null || takenSet.has(selectedCardNo))
      return;
    const cardNo = selectedCardNo;
    setJoining(true);
    setStatusMsg(`Joining with Card #${cardNo}...`);

    try {
      const res = await fetch("/api/join", {
        method: "POST",
        headers,
        body: JSON.stringify({ card_no: cardNo, initData }),
      });
      const data = await res.json();
      if (!res.ok) {
        setStatusMsg(data.error || "Could not join round.");
      } else {
        setStatusMsg(`Joined with Card #${cardNo}!`);
        if (data.state) setState(data.state);
      }
    } catch {
      setStatusMsg("Network error while joining.");
    } finally {
      setJoining(false);
    }
  }

  const calledList = state?.called || [];
  const hasJoinedCard = Boolean(
    state && state.my_card_no != null && state.my_card,
  );

  return (
    <div onPointerDown={() => ensureAudio(soundEnabledRef.current)}>
      <div className="topbar">
        <strong>75-Ball Bingo</strong>
        <button className="secondary" type="button" onClick={handleToggleSound}>
          {soundEnabled ? "Sound: ON" : "Sound: OFF"}
        </button>
      </div>

      <div className="stats">
        <div className="stat">
          <div className="stat-label">Balance</div>
          <div className="stat-val">{state ? state.balance : "-"}</div>
        </div>
        <div className="stat">
          <div className="stat-label">Prize</div>
          <div className="stat-val">{state ? state.prize : "-"}</div>
        </div>
        <div className="stat">
          <div className="stat-label">Players</div>
          <div className="stat-val">{state ? state.players_count : "-"}</div>
        </div>
        <div className="stat">
          <div className="stat-label">Round</div>
          <div className="stat-val">
            {!state
              ? "-"
              : state.state === "lobby"
                ? `Lobby (${state.lobby_seconds_left}s)`
                : state.state}
          </div>
        </div>
      </div>

      <div className="panel">
        <div className="call-banner">
          <div>
            <div className="stat-label">Latest Call</div>
            <div className="last-call">
              {state?.last_call ? state.last_call.label : "--"}
            </div>
          </div>
          <div className="stat-label">{calledList.length} / 75 called</div>
        </div>

        <div className="called-strip">
          {[...calledList].reverse().map((item, idx) => (
            <span key={`${item.num}-${idx}`} className="chip">
              {item.label}
            </span>
          ))}
        </div>

        {state?.result && (
          <div className="winner-box">
            BINGO on {state.result.last}! Winning card(s):{" "}
            {state.result.cards.map((c) => `#${c}`).join(", ")} (
            {state.result.share} credits each).
          </div>
        )}
      </div>

      {!hasJoinedCard ? (
        <div className="panel">
          <div className="picker-header">
            <div className="stat-label">
              Choose Card Number:{" "}
              <strong style={{ color: "var(--text)" }}>
                {selectedCardNo != null ? `#${selectedCardNo}` : "None"}
              </strong>
            </div>
            <div className="picker-actions">
              <button
                className="secondary"
                type="button"
                disabled={
                  !canPick || availableCardNumbers.length === 0 || joining
                }
                onClick={handleRandomCard}
              >
                Random
              </button>
              <button
                type="button"
                disabled={
                  !canPick ||
                  selectedCardNo == null ||
                  takenSet.has(selectedCardNo) ||
                  joining
                }
                onClick={handleJoin}
              >
                Join ({state?.stake ?? 10})
              </button>
            </div>
          </div>

          <div className="card-num-grid">
            {cardNumbers.map((n) => {
              const isTaken = takenSet.has(n);
              const isSelected = canPick && !isTaken && selectedCardNo === n;
              return (
                <button
                  key={n}
                  type="button"
                  className={`num-btn ${isSelected ? "selected" : ""}`}
                  disabled={!canPick || isTaken || joining}
                  onClick={() => {
                    ensureAudio(soundEnabledRef.current);
                    setSelectedCardNo(n);
                  }}
                >
                  {n}
                </button>
              );
            })}
          </div>

          {selectedCardNo != null && cardsMap[selectedCardNo] && (
            <BingoGrid
              matrix={cardsMap[selectedCardNo]}
              markedSet={new Set()}
            />
          )}

          <div className="status-msg">{statusMsg}</div>
        </div>
      ) : (
        <div className="panel">
          <div style={{ fontWeight: 700, marginBottom: 4 }}>
            Your Card #{state?.my_card_no}
          </div>
          {state?.my_card && (
            <BingoGrid
              matrix={state.my_card}
              markedSet={markedSet}
              showWinningLines={state.state === "finished"}
            />
          )}
        </div>
      )}
    </div>
  );
}
