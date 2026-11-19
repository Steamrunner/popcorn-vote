import type { PageServerLoad } from './$types';
import { nightStandings } from '$lib/server/game';
import { tonightAbsent } from '$lib/server/tonight';
import { latestEvent, tvFeatures, winnerMovie } from '$lib/server/views';

export const load: PageServerLoad = async ({ locals }) => {
	const absent = tonightAbsent(locals.db, locals.config.members);
	const standings = nightStandings(locals.db, absent);
	return {
		standings,
		features: tvFeatures(locals.db, standings),
		winner: winnerMovie(locals.db),
		lastEvent: latestEvent(locals.db)
	};
};
