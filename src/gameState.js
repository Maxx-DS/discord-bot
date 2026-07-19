function shouldNotifyFinalRelease(game, earlyAccess, isReleased) {
  return Boolean(game?.released && game?.earlyAccess && !earlyAccess && isReleased);
}

module.exports = {
  shouldNotifyFinalRelease
};
