import type { PageServerLoad } from './$types';
import { nightStandings } from '$lib/server/game';
import { tonightAbsent } from '$lib/server/tonight';
import { latestEvent, tvFeatures, winnerMovie } from '$lib/server/views';

export const load: PageServerLoad = async ({ locals }) => {
	const absent = tonightAbsent(locals.db, locals.config.members);
	const standings = nightStandings(locals.db, absent);
	return {
		// The layout withholds both until the PIN has been entered; the stage is
		// open without it (isPublicStage in hooks.server.ts) and still needs the
		// family's title and the names under a waiting movie.
		title: locals.config.title,
		members: locals.config.members,
		standings,
		features: tvFeatures(locals.db, standings),
		winner: winnerMovie(locals.db),
		lastEvent: latestEvent(locals.db)
	};
};
