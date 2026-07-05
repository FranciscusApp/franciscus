// The corpus numbers Psalms the Vulgate/Septuagint way; CEI 2008 and RSV-CE both
// use Masoretic (Hebrew) numbering. Convert the psalm number so deep links land
// on the right psalm. Verse-level offsets remain in the four merge/split psalms
// (9, 113–115, 146–147), where a Vulgate psalm maps onto part of a Hebrew one —
// the link still opens the correct psalm, but a selected verse may sit off.
export function toMasoreticPsalm(vulgate: number): number {
	if (vulgate >= 10 && vulgate <= 112) return vulgate + 1; // Vulg 10–112 → Heb 11–113
	if (vulgate >= 116 && vulgate <= 145) return vulgate + 1; // Vulg 116–145 → Heb 117–146
	if (vulgate === 113) return 114; // Heb 114 (+115)
	if (vulgate === 114 || vulgate === 115) return 116; // both → Heb 116
	if (vulgate === 146 || vulgate === 147) return 147; // both → Heb 147
	return vulgate; // 1–9 and 148–150 coincide
}
