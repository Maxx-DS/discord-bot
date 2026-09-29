function shouldNotifyFinalRelease(game, earlyAccess, isReleased) {
  return Boolean(game?.released && game?.earlyAccess && !earlyAccess && isReleased);
}

function groupGames(games) {
  return {
    releasedGames: games.filter(game => game.released && !game.earlyAccess),
    earlyAccessGames: games.filter(game => game.released && game.earlyAccess),
    pendingGames: games.filter(game => !game.released)
  };
}

module.exports = {
  shouldNotifyFinalRelease,
  groupGames
};
