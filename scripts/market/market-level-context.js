import { resolveMaximumItemLevel } from "./party-level-service.js";

export function resolveMarketMaximumForActor(profile, actor, { activeParty = null } = {}) {
  const levelLimit = profile?.availability?.levelLimit;
  if (!levelLimit) return { result: null, party: null, memberLevels: [] };

  if (levelLimit.mode === "fixed" || levelLimit.mode === "unlimited") {
    return {
      result: resolveMaximumItemLevel(levelLimit, []),
      party: null,
      memberLevels: []
    };
  }

  const party = resolveReferenceParty(actor, activeParty);
  const memberLevels = party
    ? collectCharacterLevels(party.members)
    : actor?.type === "character" && Number.isFinite(Number(actor.level))
      ? [Number(actor.level)]
      : [];

  if (memberLevels.length === 0) {
    return {
      result: {
        memberLevels: [],
        rawValue: 0,
        roundedValue: 0,
        offset: levelLimit.offset,
        maximumItemLevel: Math.max(0, levelLimit.offset)
      },
      party,
      memberLevels: []
    };
  }

  return {
    result: resolveMaximumItemLevel(levelLimit, memberLevels),
    party,
    memberLevels
  };
}

export function resolveReferenceParty(actor, activeParty = null) {
  if (actor?.type === "party") return actor;

  const parties = normalizeParties(actor?.parties);
  if (activeParty && parties.some((party) => party?.uuid === activeParty.uuid)) return activeParty;

  return parties.find((party) => party?.active) ?? parties[0] ?? null;
}

export function collectCharacterLevels(members = []) {
  return Array.from(members ?? [])
    .filter((member) => member?.type === "character")
    .map((member) => Number(member.level ?? member.system?.details?.level?.value))
    .filter((level) => Number.isFinite(level) && level >= 0);
}

function normalizeParties(parties) {
  if (!parties) return [];
  if (Array.isArray(parties)) return parties;
  if (typeof parties.values === "function") return [...parties.values()];
  if (typeof parties[Symbol.iterator] === "function") return [...parties];
  return [];
}
