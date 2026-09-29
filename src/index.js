require('dotenv').config();

const fs = require('fs');
const path = require('path');
const axios = require('axios');
const cron = require('node-cron');
const { shouldNotifyFinalRelease, groupGames } = require('./gameState');

const {
  Client,
  GatewayIntentBits
} = require('discord.js');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

const DATA_DIR = '/src/data';
const DATA_FILE = process.env.DATA_FILE || path.join(DATA_DIR, 'data.json');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

if (!fs.existsSync(DATA_FILE)) {
  const initialDataFile = path.join(__dirname, 'data.json');

  if (fs.existsSync(initialDataFile)) {
    fs.copyFileSync(initialDataFile, DATA_FILE);
    console.log(`Fichier de données copié depuis ${initialDataFile} vers ${DATA_FILE}`);
  } else {
    fs.writeFileSync(DATA_FILE, "[]");
    console.log(`Aucun fichier de données initial trouvé. Création d'un nouveau fichier vide à ${DATA_FILE}`);
  }
}

function normalizeGames(games) {
  const normalizedGames = Array.isArray(games) ? games : [];
  const maxId = normalizedGames.reduce((max, game) => Math.max(max, Number(game.id) || 0), 0);
  let nextId = maxId + 1;

  return normalizedGames.map((game) => ({
    ...game,
    id: game.id ?? nextId++
  }));
}

function loadGames() {
  const games = JSON.parse(
    fs.readFileSync(DATA_FILE, 'utf8')
  );
  return normalizeGames(games);
}

function saveGames(games) {
  fs.writeFileSync(
    DATA_FILE,
    JSON.stringify(games, null, 2)
  );
}

function getAppId(url) {
  const match = url.match(/app\/(\d+)/);
  return match ? match[1] : null;
}

async function getGame(appId) {
  const url =
    `https://store.steampowered.com/api/appdetails?appids=${appId}&l=french`;

  const res = await axios.get(url);

  return res.data[appId].data;
}

function isEarlyAccess(data) {
  return Array.isArray(data.genres) && data.genres.some(genre =>
    genre.id === 70 || genre.id === '70' ||
    String(genre.description).toLowerCase().includes('accès anticipé')
  );
}

async function updateGame(game, channel) {

  const data = await getGame(game.appId);

  const newReleaseDate = data.release_date.date;
  const isReleased = !data.release_date.coming_soon;
  const earlyAccess = isEarlyAccess(data);

  // Changement de date
  if (game?.releaseDate !== newReleaseDate) {
    await channel.send(
      `📅 Nouvelle date pour **${data.name}**\n` +
      `Ancienne date : ${game?.releaseDate}\n` +
      `Nouvelle date : ${newReleaseDate}`
    );
    game.releaseDate = newReleaseDate;
  }

  // Jeu sorti
  if (isReleased && !game.released) {
    if (earlyAccess) {
      await channel.send(
        `🎮 **${data.name}** est maintenant disponible en Early Access !\n` +
        `https://store.steampowered.com/app/${game.appId}`
      );
      game.released = true;
    } else {
      await channel.send(
        `🎮 **${data.name}** est maintenant disponible !\n` +
        `https://store.steampowered.com/app/${game.appId}`
      );
      game.released = true;
    }
  }

  // Si le jeu était en Early Access et passe en version finale, on le garde dans la liste
  if (shouldNotifyFinalRelease(game, earlyAccess, isReleased)) {
    await channel.send(
      `✅ **${data.name}** est sorti en version finale.`
    );
    game.earlyAccess = false;
  }

  game.name = data.name;
  game.earlyAccess = earlyAccess;

  return { game };
}

client.once('clientReady', () => {
  console.log(`Bot connecté : ${client.user.tag}`);
});

client.on('messageCreate', async (message) => {

  if (message.author.bot) return;

  if (message.content === "!ping") {
    message.reply("Pong !");
  }

  // Ajouter un jeu
  if (message.content.startsWith('!add')) {

    const steamUrl = message.content.split(' ')[1];

    if (!steamUrl) {
      return message.reply('Ajoute une URL Steam.');
    }

    const appId = getAppId(steamUrl);

    if (!appId) {
      return message.reply('URL Steam invalide.');
    }

    const data = await getGame(appId);
    const earlyAccess = isEarlyAccess(data);
    const isReleased = !data.release_date.coming_soon;

    let games = loadGames();
    const nextId = games.reduce((max, game) => Math.max(max, Number(game.id) || 0), 0) + 1;

    games.push({
      id: nextId,
      appId,
      name: data.name,
      releaseDate: data.release_date.date,
      released: isReleased,
      earlyAccess
    });

    saveGames(games);

    message.reply(`✅ ${data.name} ajouté.`);
  }

  if (message.content.startsWith('!delete')) {
    const id = Number(message.content.split(/\s+/)[1]);

    if (!id) {
      return message.reply('Utilise !delete <id>.');
    }

    const games = loadGames();
    const remainingGames = games.filter(game => game.id !== id);

    if (remainingGames.length === games.length) {
      return message.reply(`Aucun jeu avec l'ID ${id}.`);
    }

    saveGames(remainingGames);
    return message.reply(`🗑️ Jeu #${id} supprimé.`);
  }

  // Liste des jeux
  if (message.content === '!list') {

    const games = loadGames();

    if (games.length === 0) {
      return message.reply('Aucun jeu.');
    }

    const { releasedGames, earlyAccessGames, pendingGames } = groupGames(games);

    const sections = [
      { title: '✅ Jeux sortis', games: releasedGames },
      { title: '🟡 Jeux en early access', games: earlyAccessGames },
      { title: '⏳ Jeux pas encore sortis', games: pendingGames }
    ];

    let txt = '🎲 Idée jeux\n\n';
    txt += '🗑️ Utilise "!delete <id>" pour retirer un jeu de la liste.\n\n';

    txt += sections.map(section => {
      const content = section.games.length > 0
        ? section.games.map(game => `• #${game.id} ${game.name} — 📅 ${game?.releaseDate}`).join('\n')
        : '• Aucun jeu.';

      return `${section.title}\n${content}`;
    }).join('\n\n');

    message.reply(txt);
  }

  // Affiche le JSON brut de games.json
  if (message.content === '!listbrut') {
    const games = loadGames();
    return message.reply(`\`\`\`json\n${JSON.stringify(games, null, 2)}\n\`\`\``);
  }
});

// Vérification toutes les heures
cron.schedule('0 * * * *', async () => {
  console.log('Steam update check...');
  try {
    const channel = await client.channels.fetch(process.env.CHANNEL_ID);
    const games = loadGames();
    const updatedGames = [];

    for (let i = 0; i < games.length; i++) {
      try {
        const result = await updateGame(games[i], channel);
        updatedGames.push(result.game);
      } catch (err) {
        console.error(
          `Erreur jeu ${games[i].appId}`,
          err
        );
        updatedGames.push(games[i]);
      }
    }

    saveGames(updatedGames);
    console.log('Games updated');
  } catch (err) {
    console.error('Erreur cron', err);
  }
});

client.login(process.env.TOKEN);
