require('dotenv').config();

const fs = require('fs');
const axios = require('axios');
const cron = require('node-cron');

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

const FILE = './src/games.json';

function loadGames() {
  return JSON.parse(fs.readFileSync(FILE));
}

function saveGames(games) {
  fs.writeFileSync(FILE, JSON.stringify(games, null, 2));
}

function getAppId(url) {
  const match = url.match(/app\/(\d+)/);
  return match ? match[1] : null;
}

async function getGame(appId) {
  const url =
    `https://store.steampowered.com/api/appdetails?appids=${appId}`;

  const res = await axios.get(url);

  return res.data[appId].data;
}

function isEarlyAccess(data) {
  return Array.isArray(data.genres) && data.genres.some(genre =>
    genre.id === 70 || genre.id === '70' ||
    String(genre.description).toLowerCase().includes('early access')
  );
}

async function updateGame(game, channel) {

  const data = await getGame(game.appId);

  const newReleaseDate = data.release_date.date;
  const isReleased = !data.release_date.coming_soon;
  const earlyAccess = isEarlyAccess(data);
  let removeFromList = false;

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
      removeFromList = true;
    }
  }

  // Si le jeu était en Early Access et passe en version finale, on le retire de la liste
  if (game.released && !earlyAccess && isReleased) {
    await channel.send(
      `✅ **${data.name}** est sorti en V1 et ne sera plus suivi ici.`
    );
    removeFromList = true;
  }

  game.name = data.name;
  game.earlyAccess = earlyAccess;

  return { game, removeFromList };
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

    games.push({
      appId,
      name: data.name,
      releaseDate: data.release_date.date,
      released: isReleased,
      earlyAccess
    });

    saveGames(games);

    message.reply(`✅ ${data.name} ajouté.`);
  }

  // Liste des jeux
  if (message.content === '!list') {

    const games = loadGames();

    if (games.length === 0) {
      return message.reply('Aucun jeu.');
    }

    let txt = games
      .map(g => {
        const status = g.earlyAccess
          ? ' — 🟡 Early Access'
          : g.released
            ? ' — ✅ Sorti'
            : '';
        return `• ${g.name} — 📅 ${g?.releaseDate}${status}`;
      })
      .join('\n');

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
        if (!result.removeFromList) {
          updatedGames.push(result.game);
        }
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
