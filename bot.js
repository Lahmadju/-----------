// bot.js
require('dotenv').config();
const fs = require('fs');
const { Telegraf, Markup } = require('telegraf');
const bot = new Telegraf(process.env.BOT_TOKEN);

// Определяем роли пользователей
const roles = {
  OWNER: 'owner',
  ADMIN: 'admin',
  MODERATOR: 'moderator',
  USER: 'user',
};

const OWNER_ID = parseInt(process.env.OWNER_ID);
const users = new Map(); // Хранит пользователей и их роли
let products = []; // Список товаров
let contacts = []; // Список контактов
const feedbacks = []; // Список обратной связи

const userStates = new Map(); // Хранит состояние взаимодействия каждого пользователя
let tempData = {}; // Временное хранилище данных при добавлении товаров/контактов

// Загрузка данных из файлов
function loadData() {
  if (fs.existsSync('products.json')) {
    products = JSON.parse(fs.readFileSync('products.json'));
  }
  if (fs.existsSync('contacts.json')) {
    contacts = JSON.parse(fs.readFileSync('contacts.json'));
  }
  if (fs.existsSync('users.json')) {
    const userList = JSON.parse(fs.readFileSync('users.json'));
    userList.forEach((u) => users.set(u.id, u));
  }
}

// Сохраняем данные в файлы
function saveData() {
  fs.writeFileSync('products.json', JSON.stringify(products, null, 2));
  fs.writeFileSync('contacts.json', JSON.stringify(contacts, null, 2));
  fs.writeFileSync('users.json', JSON.stringify(Array.from(users.values()), null, 2));
}

loadData();

// Middleware для установки роли и состояния
bot.use(async (ctx, next) => {
  if (!ctx.from) return;
  const { id, username } = ctx.from;
  if (!users.has(id)) {
    const role = id === OWNER_ID ? roles.OWNER : roles.USER;
    users.set(id, { id, username, role });
    saveData();
  }
  ctx.user = users.get(id);
  ctx.state = userStates.get(id) || 'default';
  return next();
});

const isAdmin = (ctx) => [roles.ADMIN, roles.MODERATOR, roles.OWNER].includes(ctx.user.role);
const isOwner = (ctx) => ctx.user.role === roles.OWNER;

// Главное меню для пользователей
function mainMenu(ctx) {
  userStates.set(ctx.from.id, 'default');
  return ctx.reply('Выберите действие:', Markup.keyboard([
    ['📦 Товары', '📞 Контакты'],
    ['✉️ Обратная связь'],
    ...(isAdmin(ctx) ? [['🛠 Админ панель']] : [])
  ]).resize());
}

// Команда /start
bot.start((ctx) => mainMenu(ctx));

// Показать список товаров
bot.hears('📦 Товары', async (ctx) => {
  userStates.set(ctx.from.id, 'default');
  if (products.length === 0) return ctx.reply('Товары пока не добавлены.');
  products.forEach((p, i) => ctx.reply(`${i + 1}. ${p.name} — ${p.description}`));
});

// Показать список контактов
bot.hears('📞 Контакты', async (ctx) => {
  userStates.set(ctx.from.id, 'default');
  if (contacts.length === 0) return ctx.reply('Контакты пока не добавлены.');
  contacts.forEach((c, i) => ctx.reply(`${i + 1}. ${c.name}: ${c.value}`));
});

// Раздел обратной связи
bot.hears('✉️ Обратная связь', (ctx) => {
  const existing = feedbacks.find(f => f.from === ctx.from.id && !f.answered);
  if (existing) {
    return ctx.reply('Вы уже отправили сообщение. Пожалуйста, дождитесь ответа администрации.');
  }
  userStates.set(ctx.from.id, 'feedback');
  ctx.reply('Отправьте ваше сообщение (текст, фото, голосовое, видео или файл):');
});

// Админ панель
bot.hears('🛠 Админ панель', (ctx) => {
  if (!isAdmin(ctx)) return;
  userStates.set(ctx.from.id, 'admin');
  ctx.reply('Админ панель:', Markup.inlineKeyboard([
    [Markup.button.callback('➕ Добавить товар', 'add_product')],
    [Markup.button.callback('➖ Удалить товар', 'delete_product')],
    [Markup.button.callback('➕ Добавить контакт', 'add_contact')],
    [Markup.button.callback('➖ Удалить контакт', 'delete_contact')],
    ...(isOwner(ctx) ? [[Markup.button.callback('👤 Управление модераторами', 'manage_mods')]] : [])
  ]));
});

// Управление модераторами (только для владельца)
bot.action('manage_mods', (ctx) => {
  const mods = Array.from(users.values()).filter(u => u.role === roles.MODERATOR);
  let text = '👥 Список модераторов:\n';
  mods.forEach((m, i) => {
    text += `${i + 1}. ${m.username || m.id}\n`;
  });
  ctx.reply(text, Markup.inlineKeyboard([
    [Markup.button.callback('➕ Назначить модератора', 'add_mod')],
    [Markup.button.callback('➖ Удалить модератора', 'remove_mod')]
  ]));
});

bot.action('add_mod', (ctx) => {
  userStates.set(ctx.from.id, 'add_mod');
  ctx.reply('Введите ID пользователя для назначения модератором:');
});

bot.action('remove_mod', (ctx) => {
  userStates.set(ctx.from.id, 'remove_mod');
  ctx.reply('Введите ID модератора для удаления:');
});

// Обработка кнопок из админки
bot.action('add_product', async (ctx) => {
  userStates.set(ctx.from.id, 'add_product_name');
  ctx.reply('Введите название товара:');
});

bot.action('delete_product', async (ctx) => {
  userStates.set(ctx.from.id, 'delete_product_index');
  ctx.reply('Введите номер товара для удаления:');
});

bot.action('add_contact', async (ctx) => {
  userStates.set(ctx.from.id, 'add_contact');
  ctx.reply('Введите имя контакта:');
});

bot.action('delete_contact', async (ctx) => {
  userStates.set(ctx.from.id, 'delete_contact_index');
  ctx.reply('Введите номер контакта для удаления:');
});

// Обработка всех сообщений
bot.on('message', async (ctx, next) => {
  const state = userStates.get(ctx.from.id);

  // Обработка обратной связи
  if (state === 'feedback') {
    const feedbackId = feedbacks.length;
    feedbacks.push({ from: ctx.from.id, msg: ctx.message, answered: false, date: new Date() });
    users.forEach((u) => {
      if (isAdmin({ user: u })) {
        const feedback = feedbacks[feedbackId];
        const username = ctx.from.username ? `@${ctx.from.username}` : ctx.from.id;
        const time = feedback.date.toLocaleString();
        bot.telegram.sendMessage(u.id, `📨 Новое сообщение:\n👤 Пользователь: ${username}\n🕒 Время: ${time}\n\nСообщение:`,
          Markup.inlineKeyboard([
            [Markup.button.callback('Ответить', `reply_${feedbackId}`)]
          ])
        );
        bot.telegram.copyMessage(u.id, ctx.chat.id, ctx.message.message_id);
      }
    });
    userStates.set(ctx.from.id, 'default');
    return ctx.reply('Ваше сообщение отправлено администрации.');
  }

  if (ctx.state === 'feedback') return;

  // Добавление товара
  if (state === 'add_product_name') {
    tempData[ctx.from.id] = { name: ctx.message.text };
    userStates.set(ctx.from.id, 'add_product_desc');
    return ctx.reply('Введите описание товара:');
  } else if (state === 'add_product_desc') {
    const { name } = tempData[ctx.from.id];
    products.push({ name, description: ctx.message.text });
    saveData();
    delete tempData[ctx.from.id];
    userStates.set(ctx.from.id, 'default');
    return ctx.reply('Товар добавлен.');
  }

  // Удаление товара
  if (state === 'delete_product_index') {
    const index = parseInt(ctx.message.text) - 1;
    if (!isNaN(index) && products[index]) {
      const removed = products.splice(index, 1)[0];
      saveData();
      userStates.set(ctx.from.id, 'default');
      return ctx.reply(`Товар "${removed.name}" удалён.`);
    } else {
      return ctx.reply('Неверный номер товара.');
    }
  }

  // Добавление контакта
  if (state === 'add_contact') {
    tempData[ctx.from.id] = { name: ctx.message.text };
    userStates.set(ctx.from.id, 'add_contact_value');
    return ctx.reply('Введите значение контакта:');
  }

  if (state === 'add_contact_value') {
    const { name } = tempData[ctx.from.id];
    contacts.push({ name, value: ctx.message.text });
    saveData();
    delete tempData[ctx.from.id];
    userStates.set(ctx.from.id, 'default');
    return ctx.reply('Контакт добавлен.');
  }

  // Удаление контакта
  if (state === 'delete_contact_index') {
    const index = parseInt(ctx.message.text) - 1;
    if (!isNaN(index) && contacts[index]) {
      const removed = contacts.splice(index, 1)[0];
      saveData();
      userStates.set(ctx.from.id, 'default');
      return ctx.reply(`Контакт "${removed.name}" удалён.`);
    } else {
      return ctx.reply('Неверный номер контакта.');
    }
  }

  // Назначение модератора
  if (state === 'add_mod') {
    const id = parseInt(ctx.message.text);
    if (users.has(id)) {
      users.get(id).role = roles.MODERATOR;
      saveData();
      userStates.set(ctx.from.id, 'default');
      return ctx.reply('Модератор назначен.');
    }
    return ctx.reply('Пользователь не найден.');
  }

  // Удаление модератора
  if (state === 'remove_mod') {
    const id = parseInt(ctx.message.text);
    if (users.has(id) && users.get(id).role === roles.MODERATOR) {
      users.get(id).role = roles.USER;
      saveData();
      userStates.set(ctx.from.id, 'default');
      return ctx.reply('Модератор удалён.');
    }
    return ctx.reply('Модератор не найден.');
  }

  next();
});

// Запуск бота
bot.launch();

// Обработка остановки процесса
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
