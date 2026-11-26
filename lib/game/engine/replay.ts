/**
 * Игровой движок: детерминированный пересчёт всего состояния персонажа (SPEC 3.6, PLAN 2 п. 1).
 *
 * replay(input) проходит дни от регистрации до сегодня. В каждом дне:
 *   1) применяет решения пользователя этого дня (по времени);
 *   2) начисляет XP за подтверждённые записи (по порядку внутри дня);
 *   3) закрывает день: характеристики (звёзды/очки, активные дни), уровень персонажа,
 *      предложения навыков, готовность к раскрытию, HP и статус-эффекты.
 *
 * Тот же вход → тот же результат, независимо от порядка строк во входе.
 */
import {
  GENERAL_KEYS,
  partsOf,
  resolveAttribute,
  type AttributeKey,
  type GeneralKey,
  type PartKey,
} from "../attributes";
import { GAME_CONFIG as C } from "../config";
import { addDays, diffDays, maxDate, minDate, type IsoDate } from "../dates";
import {
  addAttributeXp,
  attributeTagWeights,
  canOfferUnfold,
  characterLevelFromXp,
  clampAssessmentBonuses,
  diminishingFactor,
  entryXp,
  mainSlots,
  normalizeShares,
  secondarySlots,
  skillLevelFromXp,
  skillRank,
  skillXp,
  splitPool,
  starsOf,
  unfoldValues,
  validateCalibration,
  type AttributeProgress,
} from "../formulas";
import { computeHp, isRestDay, secondWindBonus, type HpDayEntry } from "../hp";
import type {
  AttributeState,
  CandidateState,
  EngineDecision,
  EngineEntry,
  EngineInput,
  EngineResult,
  GameEvent,
  HpDayState,
  SkillDef,
  SkillSlot,
  SkillState,
  XpLedgerEvent,
} from "./types";

interface AttrInternal extends AttributeState {
  progress: AttributeProgress;
}

interface CandidateInternal extends CandidateState {
  dailyMinutes: Map<IsoDate, number>;
  snoozedUntil: IsoDate | null;
  requested: boolean;
}

interface CalibrationWindow {
  kind: "start" | "unfold";
  general?: GeneralKey;
  keys: AttributeKey[];
  base: number[];
  opened: IsoDate;
  expires: IsoDate;
  closed: boolean;
  rules: { pointsTotal: number; min: number; max: number };
}

type GameEventInput = GameEvent extends infer E ? (E extends GameEvent ? Omit<E, "id"> : never) : never;

export function replay(input: EngineInput): EngineResult {
  const exp = input.experiments;
  const skillDefs = new Map<string, SkillDef>(input.skills.map((s) => [s.id, s]));
  const requested = new Set(input.requestedClusters);

  const entries = [...input.entries].sort(
    (a, b) =>
      a.date.localeCompare(b.date) || a.orderKey.localeCompare(b.orderKey) || a.id.localeCompare(b.id),
  );
  const decisions = [...input.decisions].sort(
    (a, b) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id),
  );

  // Кластер → навык, взятый из этого кластера. Известно заранее: опыт засчитывается задним числом.
  const clusterToSkill = new Map<string, { skillId: string; slot: SkillSlot }>();
  for (const d of decisions) {
    if (d.kind === "take_skill" && d.payload.clusterKey) {
      clusterToSkill.set(d.payload.clusterKey, { skillId: d.payload.skillId, slot: d.payload.slot });
    }
  }

  // ───────── состояние ─────────
  let totalXp = 0;
  const skills = new Map<string, SkillState>();
  const candidates = new Map<string, CandidateInternal>();
  const attrs = new Map<AttributeKey, AttrInternal>();
  const unfolded = new Set<GeneralKey>();
  const tagXp: Partial<Record<GeneralKey, Partial<Record<PartKey, number>>>> = {};
  const windows: CalibrationWindow[] = [];
  const hpDays: Record<IsoDate, HpDayState> = {};
  const ledger: XpLedgerEvent[] = [];
  const events: GameEvent[] = [];
  const rejected: { id: string; reason: string }[] = [];

  for (const g of GENERAL_KEYS) attrs.set(g, newAttr(g, "general", C.attributes.base));

  const emit = (e: GameEventInput) => {
    const key =
      "skillId" in e
        ? e.skillId
        : "attribute" in e
          ? e.attribute
          : "general" in e
            ? e.general
            : "cluster" in e
              ? e.cluster
              : "slot" in e
                ? e.slot
                : "";
    const detail = "to" in e ? e.to : "stars" in e ? e.stars : "milestone" in e ? e.milestone : "";
    events.push({ ...e, id: `${e.type}:${key}:${detail}:${e.date}` } as GameEvent);
  };

  const level = () => characterLevelFromXp(totalXp).level;

  const attrValue = (tag: PartKey | null): number => {
    if (!tag) return C.attributes.base;
    return attrs.get(resolveAttribute(tag, unfolded))?.value ?? C.attributes.base;
  };

  const slotCount = (slot: SkillSlot) =>
    [...skills.values()].filter((s) => s.status === "active" && s.slot === slot).length;

  const ensureSkill = (id: string): SkillState => {
    let st = skills.get(id);
    if (!st) {
      const mapped = [...clusterToSkill.values()].find((m) => m.skillId === id);
      st = {
        id,
        // навык ещё не взят, но опыт по его кластеру копится задним числом
        status: mapped ? "pending" : "active",
        slot: mapped ? mapped.slot : "none",
        xp: 0,
        level: 1,
        awakenedOn: null,
        takenOn: null,
        specializations: [],
        pendingSpecializations: [],
      };
      skills.set(id, st);
    }
    return st;
  };

  const ensureCandidate = (cluster: string): CandidateInternal => {
    let c = candidates.get(cluster);
    if (!c) {
      c = {
        cluster,
        xpPool: 0,
        minutesTotal: 0,
        daysSeen: 0,
        firstSeen: null,
        lastSeen: null,
        offerStatus: "accruing",
        offeredOn: null,
        dailyMinutes: new Map(),
        snoozedUntil: null,
        requested: requested.has(cluster),
      };
      candidates.set(cluster, c);
    }
    return c;
  };

  // ───────── решения ─────────
  const applyDecision = (d: EngineDecision) => {
    switch (d.kind) {
      case "take_skill": {
        const st = ensureSkill(d.payload.skillId);
        st.status = "active";
        st.slot = d.payload.slot;
        st.takenOn ??= d.date;
        if (d.payload.clusterKey) ensureCandidate(d.payload.clusterKey).offerStatus = "accepted";
        return;
      }
      case "add_sleeping_skill": {
        const st = ensureSkill(d.payload.skillId);
        if (st.awakenedOn) return; // уже пробуждён — повторное добавление ничего не меняет
        st.status = "sleeping";
        st.slot = "none";
        st.takenOn ??= d.date;
        return;
      }
      case "archive_skill": {
        const st = skills.get(d.payload.skillId);
        if (!st) return reject(d, "unknown_skill");
        st.status = "archived";
        st.slot = "none";
        return;
      }
      case "restore_skill":
      case "move_slot": {
        const st = skills.get(d.payload.skillId);
        if (!st) return reject(d, "unknown_skill");
        st.status = "active";
        st.slot = d.payload.slot;
        return;
      }
      case "snooze_skill": {
        const c = ensureCandidate(d.payload.clusterKey);
        c.offerStatus = "snoozed";
        c.snoozedUntil = addDays(d.date, 7);
        return;
      }
      case "decline_skill":
        ensureCandidate(d.payload.clusterKey).offerStatus = "declined";
        return;
      case "choose_specialization": {
        const st = skills.get(d.payload.skillId);
        if (!st) return reject(d, "unknown_skill");
        if (!st.pendingSpecializations.includes(d.payload.milestone)) {
          return reject(d, "milestone_not_available");
        }
        st.pendingSpecializations = st.pendingSpecializations.filter((m) => m !== d.payload.milestone);
        st.specializations.push({ milestone: d.payload.milestone, name: d.payload.name });
        return;
      }
      case "assessment": {
        const keys = GENERAL_KEYS.filter((g) => !unfolded.has(g));
        const bonuses = clampAssessmentBonuses(GENERAL_KEYS.map((g) => d.payload.bonuses[g] ?? 0));
        GENERAL_KEYS.forEach((g, i) => {
          if (unfolded.has(g)) return;
          const a = attrs.get(g)!;
          a.value = a.progress.value = C.attributes.base + bonuses[i];
        });
        const sc = C.attributes.startCalibration;
        windows.push({
          kind: "start",
          keys,
          base: keys.map((k) => attrs.get(k)!.value),
          opened: d.date,
          expires: addDays(d.date, sc.days - 1),
          closed: false,
          rules: { pointsTotal: sc.points, min: sc.min, max: sc.max },
        });
        return;
      }
      case "calibration_move": {
        const w = findWindow(d.payload.kind, d.payload.general);
        if (!w || w.closed || d.date > w.expires) return reject(d, "calibration_closed");
        const next = w.keys.map((k) => d.payload.values[k] ?? attrs.get(k)!.value);
        const v = validateCalibration(w.base, next, w.rules);
        if (!v.ok) return reject(d, v.reason);
        w.keys.forEach((k, i) => {
          const a = attrs.get(k)!;
          a.value = a.progress.value = next[i];
        });
        return;
      }
      case "calibration_finish": {
        const w = findWindow(d.payload.kind, d.payload.general);
        if (!w) return reject(d, "calibration_not_found");
        w.closed = true;
        return;
      }
      case "unfold": {
        const g = d.payload.general;
        const a = attrs.get(g)!;
        if (unfolded.has(g)) return reject(d, "already_unfolded");
        if (
          !canOfferUnfold({
            characterLevel: level(),
            xpSinceStart: a.xpTotal,
            activeDaysTotal: a.activeDaysTotal,
          })
        ) {
          return reject(d, "unfold_conditions_not_met");
        }
        unfold(g, d.date);
        return;
      }
      case "decline_unfold":
        return;
    }
  };

  const reject = (d: EngineDecision, reason: string) => {
    rejected.push({ id: d.id, reason });
  };

  const findWindow = (kind: "start" | "unfold", general?: GeneralKey) =>
    [...windows].reverse().find((w) => w.kind === kind && (kind === "start" || w.general === general));

  const unfold = (g: GeneralKey, date: IsoDate) => {
    const a = attrs.get(g)!;
    const parts = partsOf(g);
    const shares = parts.map((p) => tagXp[g]?.[p] ?? 0);
    const values = unfoldValues(a.value, shares);
    const pools = splitPool(a.progress.pool, shares);
    const created: Partial<Record<PartKey, number>> = {};
    parts.forEach((p, i) => {
      const child = newAttr(p, "part", values[i]);
      child.progress.pool = pools[i];
      child.pool = pools[i];
      child.stars = starsOf(child.progress);
      attrs.set(p, child);
      created[p] = values[i];
    });
    a.state = "unfolded";
    a.unfoldedOn = date;
    unfolded.add(g);
    const u = C.attributes.unfold;
    windows.push({
      kind: "unfold",
      general: g,
      keys: parts,
      base: values,
      opened: date,
      expires: addDays(date, u.calibrationDays - 1),
      closed: false,
      rules: {
        pointsTotal: u.calibrationPoints,
        min: C.attributes.base,
        max: Math.max(...values) + u.calibrationMaxOverChild,
      },
    });
    emit({ type: "unfolded", date, general: g, values: created });
  };

  // ───────── записи ─────────
  // накопители текущего дня
  let dayMinutes = new Map<string, number>();
  let dayAttrXp = new Map<AttributeKey, number>();
  let dayAttrMinutes = new Map<AttributeKey, number>();

  const addAttr = (tag: PartKey, xp: number, minutes: number, entryId: string, why: string) => {
    if (xp <= 0 && minutes <= 0) return;
    const key = resolveAttribute(tag, unfolded);
    dayAttrXp.set(key, (dayAttrXp.get(key) ?? 0) + xp);
    dayAttrMinutes.set(key, (dayAttrMinutes.get(key) ?? 0) + minutes);
    if (key !== tag) {
      const g = key as GeneralKey;
      const bucket = (tagXp[g] ??= {});
      bucket[tag] = (bucket[tag] ?? 0) + xp;
    }
    if (xp > 0) {
      ledger.push({
        entryId,
        targetType: "attribute",
        targetId: key,
        amount: xp,
        multipliers: { via: why, tag },
      });
    }
  };

  const addAttrByTags = (
    primary: PartKey | null,
    secondary: PartKey | null,
    xp: number,
    minutes: number,
    entryId: string,
    why: string,
  ) => {
    const w = attributeTagWeights(Boolean(primary && secondary));
    if (primary) addAttr(primary, xp * w.primary, minutes, entryId, why);
    if (secondary) addAttr(secondary, xp * (primary ? w.secondary : 1), minutes, entryId, why);
  };

  const noSkillWeight = C.experiments.noSkillAttributeWeight[exp.noSkillAttributeWeight];

  const processEntry = (e: EngineEntry, buffs: { character: number; skill: number }) => {
    const xpE = entryXp(e.focusMinutes, e.intensity, e.novelty);
    const charXp = xpE * (1 + buffs.character);
    totalXp += charXp;
    ledger.push({
      entryId: e.id,
      targetType: "character",
      targetId: "character",
      amount: charXp,
      multipliers: { entryXp: xpE, buff: buffs.character },
    });

    const max = C.entry.maxSkillsPerEntry;
    const allocs = normalizeShares(normalizeShares(e.allocations).slice(0, max));
    if (allocs.length === 0) {
      const t = e.attributeTags;
      if (t) addAttrByTags(t.primary, t.secondary, xpE * noSkillWeight, e.focusMinutes, e.id, "no_skill");
      return;
    }

    for (const a of allocs) {
      const minutes = e.focusMinutes * a.share;
      const mapped = a.cluster ? clusterToSkill.get(a.cluster) : undefined;
      const skillId = a.skillId ?? mapped?.skillId ?? null;
      if (a.cluster) trackCandidate(a.cluster, e.date, minutes);

      if (skillId && skillDefs.has(skillId)) {
        creditSkill(e, a.share, minutes, skillDefs.get(skillId)!, xpE, buffs.skill, a.matchesSpecialization);
      } else if (a.cluster) {
        const c = ensureCandidate(a.cluster);
        const key = `cluster:${a.cluster}`;
        const prior = dayMinutes.get(key) ?? 0;
        dayMinutes.set(key, prior + minutes);
        const dim = diminishingFactor(prior, minutes, false);
        const amount = xpE * a.share * dim;
        c.xpPool += amount;
        ledger.push({
          entryId: e.id,
          targetType: "candidate",
          targetId: a.cluster,
          amount,
          multipliers: { share: a.share, diminishing: dim },
        });
        const t = e.attributeTags;
        if (t) addAttrByTags(t.primary, t.secondary, amount * noSkillWeight, minutes, e.id, "candidate");
      } else {
        const t = e.attributeTags;
        if (t) {
          addAttrByTags(t.primary, t.secondary, xpE * a.share * noSkillWeight, minutes, e.id, "no_skill");
        }
      }
    }
  };

  const trackCandidate = (cluster: string, date: IsoDate, minutes: number) => {
    const c = ensureCandidate(cluster);
    c.minutesTotal += minutes;
    if (!c.dailyMinutes.has(date)) c.daysSeen += 1;
    c.dailyMinutes.set(date, (c.dailyMinutes.get(date) ?? 0) + minutes);
    c.firstSeen ??= date;
    c.lastSeen = date;
  };

  const creditSkill = (
    e: EngineEntry,
    share: number,
    minutes: number,
    def: SkillDef,
    xpE: number,
    skillBuff: number,
    matchesSpecialization: boolean | undefined,
  ) => {
    const st = ensureSkill(def.id);
    if (st.status === "sleeping") {
      st.status = "active";
      st.awakenedOn = e.date;
      st.slot =
        slotCount("secondary") < secondarySlots(level())
          ? "secondary"
          : slotCount("main") < mainSlots(level())
            ? "main"
            : "none";
      emit({ type: "skill_awakened", date: e.date, entryId: e.id, skillId: def.id });
    }
    const key = `skill:${def.id}`;
    const prior = dayMinutes.get(key) ?? 0;
    dayMinutes.set(key, prior + minutes);

    const specBonus =
      matchesSpecialization && st.specializations.length > 0 ? C.specialization.xpBonus : 0;
    const res = skillXp({
      entryXp: xpE,
      share,
      skillMinutes: minutes,
      priorSkillMinutesToday: prior,
      isWorkShift: def.isWorkShift,
      primaryAttributeValue: attrValue(def.primaryAttr),
      sleepingTargetLevel: def.sleepingTargetLevel,
      currentSkillXp: st.xp,
      extraBonus: specBonus + skillBuff,
    });

    const before = st.level;
    st.xp += res.amount;
    st.level = skillLevelFromXp(st.xp).level;
    if (st.level > before) {
      emit({ type: "skill_level_up", date: e.date, entryId: e.id, skillId: def.id, from: before, to: st.level });
      if (skillRank(st.level) !== skillRank(before)) {
        emit({ type: "skill_rank_up", date: e.date, entryId: e.id, skillId: def.id, rank: skillRank(st.level) });
      }
      for (const m of C.specialization.milestones) {
        const chosen = st.specializations.some((s) => s.milestone === m);
        if (before < m && st.level >= m && !chosen && !st.pendingSpecializations.includes(m)) {
          st.pendingSpecializations.push(m);
          emit({ type: "specialization_available", date: e.date, entryId: e.id, skillId: def.id, milestone: m });
        }
      }
    }
    ledger.push({
      entryId: e.id,
      targetType: "skill",
      targetId: def.id,
      amount: res.amount,
      multipliers: res.multipliers,
    });

    // В характеристики идёт XP навыка без бонусов (иначе характеристики разгоняли бы сами себя)
    // и без множителя спящего навыка (SPEC 3.1). Второстепенный слот — ×0.5.
    const factor = st.slot === "main" ? 1 : C.slots.secondaryAttributeFactor;
    const base = xpE * share * res.multipliers.diminishing * factor;
    addAttrByTags(def.primaryAttr, def.secondaryAttr, base, minutes, e.id, "skill");
  };

  // ───────── конец дня ─────────
  const closeAttributes = (date: IsoDate) => {
    const keys = new Set<AttributeKey>([...dayAttrXp.keys(), ...dayAttrMinutes.keys()]);
    for (const key of [...keys].sort()) {
      const a = attrs.get(key);
      if (!a) continue;
      const xp = dayAttrXp.get(key) ?? 0;
      const active = (dayAttrMinutes.get(key) ?? 0) >= C.attributes.activeDayMinutes;
      const r = addAttributeXp(a.progress, xp, active);
      a.progress = r.state;
      a.value = r.state.value;
      a.pool = r.state.pool;
      a.activeDaysSincePoint = r.state.activeDaysSincePoint;
      a.stars = starsOf(r.state);
      a.xpTotal += xp;
      if (active) a.activeDaysTotal += 1;
      for (const ev of r.events) {
        if (ev.type === "point") emit({ type: "attribute_point", date, attribute: key, from: ev.from, to: ev.to });
        else emit({ type: "attribute_star", date, attribute: key, stars: ev.stars });
      }
    }
  };

  const offerSkills = (date: IsoDate) => {
    const cfg = C.skillOffers;
    const allOffers = [...candidates.values()].filter((c) => c.offeredOn);
    const rampUp = diffDays(date, input.registeredOn) < cfg.rampUpDays;
    let budget = rampUp
      ? cfg.rampUpPerDay - allOffers.filter((c) => c.offeredOn === date).length
      : cfg.perWeek - allOffers.filter((c) => diffDays(date, c.offeredOn!) < 7).length;

    const eligible = [...candidates.values()]
      .filter((c) => {
        if (c.offerStatus === "snoozed" && c.snoozedUntil && date >= c.snoozedUntil) {
          c.offerStatus = "accruing";
        }
        if (c.offerStatus !== "accruing") return false;
        if (clusterToSkill.has(c.cluster) && skills.get(clusterToSkill.get(c.cluster)!.skillId)?.status !== "pending") {
          return false;
        }
        if (c.requested) return c.minutesTotal > 0;
        let minutes = 0;
        let days = 0;
        for (const [d, m] of c.dailyMinutes) {
          if (diffDays(date, d) >= 0 && diffDays(date, d) < cfg.windowDays) {
            minutes += m;
            days += 1;
          }
        }
        return minutes >= cfg.minMinutes && days >= cfg.minDistinctDays;
      })
      .sort((a, b) => b.minutesTotal - a.minutesTotal || a.cluster.localeCompare(b.cluster));

    for (const c of eligible) {
      if (budget <= 0) break;
      c.offerStatus = "offered";
      c.offeredOn = date;
      budget -= 1;
      emit({ type: "skill_offer", date, cluster: c.cluster });
    }
  };

  const checkUnfold = (date: IsoDate) => {
    for (const g of GENERAL_KEYS) {
      const a = attrs.get(g)!;
      if (unfolded.has(g) || a.unfoldOfferedOn) continue;
      if (canOfferUnfold({ characterLevel: level(), xpSinceStart: a.xpTotal, activeDaysTotal: a.activeDaysTotal })) {
        a.unfoldOfferedOn = date;
        emit({ type: "unfold_available", date, general: g });
      }
    }
  };

  // ───────── проход по дням ─────────
  const firstDate = [
    input.registeredOn,
    entries[0]?.date,
    decisions[0]?.date,
  ].filter(Boolean).reduce((a, b) => minDate(a!, b!)) as IsoDate;
  const lastDate = maxDate(input.today, entries.at(-1)?.date ?? input.today);

  const entriesByDay = new Map<IsoDate, EngineEntry[]>();
  for (const e of entries) {
    const list = entriesByDay.get(e.date) ?? [];
    list.push(e);
    entriesByDay.set(e.date, list);
  }
  const decisionsByDay = new Map<IsoDate, EngineDecision[]>();
  for (const d of decisions) {
    const list = decisionsByDay.get(d.date) ?? [];
    list.push(d);
    decisionsByDay.set(d.date, list);
  }

  let yesterdayRest = false;
  let lastActiveDate: IsoDate | null = null;
  let returnDate: IsoDate | null = null;
  let returnBreak = 0;

  for (let date = firstDate; date <= lastDate; date = addDays(date, 1)) {
    for (const d of decisionsByDay.get(date) ?? []) applyDecision(d);

    const dayEntries = entriesByDay.get(date) ?? [];
    if (dayEntries.length > 0 && lastActiveDate) {
      const gap = diffDays(date, lastActiveDate) - 1;
      if (gap >= C.experiments.secondWind.breakDays) {
        returnDate = date;
        returnBreak = gap;
      }
    }
    const sw = returnDate
      ? secondWindBonus(exp, returnBreak, diffDays(date, returnDate))
      : { characterXpBonus: 0, skillXpBonus: 0, active: false };
    const recovery = yesterdayRest ? C.buffs.recoveryXpBonus : 0;
    const buffs = { character: recovery + sw.characterXpBonus, skill: recovery + sw.skillXpBonus };

    dayMinutes = new Map();
    dayAttrXp = new Map();
    dayAttrMinutes = new Map();
    const levelBefore = level();
    for (const e of dayEntries) processEntry(e, buffs);
    closeAttributes(date);

    const levelAfter = level();
    if (levelAfter > levelBefore) {
      emit({ type: "level_up", date, from: levelBefore, to: levelAfter });
      if (mainSlots(levelAfter) > mainSlots(levelBefore)) {
        emit({ type: "slot_unlocked", date, slot: "main", total: mainSlots(levelAfter) });
      }
      if (secondarySlots(levelAfter) > secondarySlots(levelBefore)) {
        emit({ type: "slot_unlocked", date, slot: "secondary", total: secondarySlots(levelAfter) });
      }
    }

    offerSkills(date);
    checkUnfold(date);

    // HP
    const wb = input.wellbeing[date];
    const hpEntries: HpDayEntry[] = dayEntries.map((e) => ({
      focusMinutes: e.focusMinutes,
      intensity: e.intensity,
      isRest:
        e.isRest ||
        (e.allocations.length > 0 &&
          e.allocations.every((a) => {
            const id = a.skillId ?? (a.cluster ? clusterToSkill.get(a.cluster)?.skillId : null);
            return id ? (skillDefs.get(id)?.isRest ?? false) : false;
          })),
    }));
    const restDay = isRestDay({
      variant: exp.restDay,
      entries: hpEntries,
      manualRestMark: wb?.manualRest ?? false,
      llmSaysRestDay: wb?.llmRestDay ?? null,
    });
    if (dayEntries.length > 0 || wb || date === input.today) {
      const hp = computeHp({
        enduranceValue: attrValue("endurance"),
        characterLevel: levelAfter,
        entries: hpEntries,
        checkin: wb ? { sleepHours: wb.sleepHours, mood1to5: wb.mood1to5, sick: wb.sick } : null,
        yesterdayWasRestDay: yesterdayRest,
        secondWindActive: sw.active,
      });
      hpDays[date] = { ...hp, date, restDay };
    }
    yesterdayRest = restDay;
    if (dayEntries.length > 0) lastActiveDate = date;
  }

  // ───────── результат ─────────
  const lp = characterLevelFromXp(totalXp);
  const attributes: Partial<Record<AttributeKey, AttributeState>> = {};
  for (const [k, a] of attrs) {
    const { progress: _p, ...rest } = a;
    void _p;
    attributes[k] = rest;
  }
  const cands: Record<string, CandidateState> = {};
  for (const [k, c] of candidates) {
    const { dailyMinutes: _d, snoozedUntil: _s, requested: _r, ...rest } = c;
    void _d;
    void _s;
    void _r;
    cands[k] = rest;
  }

  return {
    character: { totalXp, level: lp.level, xpIntoLevel: lp.xpIntoLevel, xpForLevel: lp.xpForLevel },
    skills: Object.fromEntries(skills),
    candidates: cands,
    attributes,
    attributeTagXp: tagXp,
    hpDays,
    ledger,
    events,
    rejectedDecisions: rejected,
  };
}

function newAttr(key: AttributeKey, state: AttrInternal["state"], value: number): AttrInternal {
  return {
    key,
    state,
    value,
    pool: 0,
    stars: 0,
    activeDaysSincePoint: 0,
    xpTotal: 0,
    activeDaysTotal: 0,
    unfoldOfferedOn: null,
    unfoldedOn: null,
    progress: { value, pool: 0, activeDaysSincePoint: 0 },
  };
}
