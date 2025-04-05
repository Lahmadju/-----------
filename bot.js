// bot.js
require('dotenv').config();
const { Telegraf, Markup } = require('telegraf');
const bot = new Telegraf(process.env.BOT_TOKEN);

const roles = {
  OWNER: 'owner',
  ADMIN: 'admin',
  MODERATOR: 'moderator',
  USER: 'user',
};

const OWNER_ID = parseInt(process.env.OWNER_ID);
const users = new Map();
const products = [];
const contacts = [];
const feedbacks = [];

const userStates = new Map();
let tempData = {};

bot.use(async (ctx, next) => {
  if (!ctx.from) return;
  const { id, username } = ctx.from;
  if (!users.has(id)) {
    const role = id === OWNER_ID ? roles.OWNER : roles.USER;
    users.set(id, { id, username, role });
  }
  ctx.user = users.get(id);
  ctx.state = userStates.get(id) || 'default';
  return next();
});

const isAdmin = (ctx) => [roles.ADMIN, roles.MODERATOR, roles.OWNER].includes(ctx.user.role);
const isOwner = (ctx) => ctx.user.role === roles.OWNER;

function mainMenu(ctx) {
  userStates.set(ctx.from.id, 'default');
  return ctx.reply('Выберите действие:', Markup.keyboard([
    ['📦 Товары', '📞 Контакты'],
    ['✉️ Обратная связь'],
    ...(isAdmin(ctx) ? [['🛠 Админ панель']] : [])
  ]).resize());
}

bot.start((ctx) => mainMenu(ctx));

bot.hears('📦 Товары', async (ctx) => {
  userStates.set(ctx.from.id, 'default');
  if (products.length === 0) return ctx.reply('Товары пока не добавлены.');
  products.forEach((p, i) => ctx.reply(`${i + 1}. ${p.name} — ${p.description}`));
});

bot.hears('📞 Контакты', async (ctx) => {
  userStates.set(ctx.from.id, 'default');
  if (contacts.length === 0) return ctx.reply('Контакты пока не добавлены.');
  contacts.forEach((c, i) => ctx.reply(`${i + 1}. ${c.name}: ${c.value}`));
});

bot.hears('✉️ Обратная связь', (ctx) => {
  const existing = feedbacks.find(f => f.from === ctx.from.id && !f.answered);
  if (existing) {
    return ctx.reply('Вы уже отправили сообщение. Пожалуйста, дождитесь ответа администрации.');
  }
  userStates.set(ctx.from.id, 'feedback');
  ctx.reply('Отправьте ваше сообщение (текст, фото, голосовое, видео или файл):');
});

bot.on('message', async (ctx, next) => {
  const state = userStates.get(ctx.from.id);

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

  if (state === 'add_product_name') {
    tempData[ctx.from.id] = { name: ctx.message.text };
    userStates.set(ctx.from.id, 'add_product_desc');
    return ctx.reply('Введите описание товара:');
  } else if (state === 'add_product_desc') {
    const { name } = tempData[ctx.from.id];
    products.push({ name, description: ctx.message.text });
    delete tempData[ctx.from.id];
    userStates.set(ctx.from.id, 'default');
    return ctx.reply('Товар добавлен.');
  }

  if (state === 'delete_product_index') {
    const index = parseInt(ctx.message.text) - 1;
    if (!isNaN(index) && products[index]) {
      const removed = products.splice(index, 1)[0];
      userStates.set(ctx.from.id, 'default');
      return ctx.reply(`Товар "${removed.name}" удалён.`);
    } else {
      return ctx.reply('Неверный номер товара.');
    }
  }

  if (state === 'add_contact_name') {
    tempData[ctx.from.id] = { name: ctx.message.text };
    userStates.set(ctx.from.id, 'add_contact_value');
    return ctx.reply('Введите значение контакта:');
  } else if (state === 'add_contact_value') {
    const { name } = tempData[ctx.from.id];
    contacts.push({ name, value: ctx.message.text });
    delete tempData[ctx.from.id];
    userStates.set(ctx.from.id, 'default');
    return ctx.reply('Контакт добавлен.');
  }

  if (state === 'edit_contact_select') {
    const index = parseInt(ctx.message.text) - 1;
    if (contacts[index]) {
      tempData[ctx.from.id] = { index };
      userStates.set(ctx.from.id, 'edit_contact_field');
      return ctx.reply('Что вы хотите изменить?', Markup.keyboard([
        ['Название контакта', 'Значение контакта']
      ]).oneTime().resize());
    } else {
      return ctx.reply('Контакт не найден. Введите корректный номер.');
    }
  } else if (state === 'edit_contact_field') {
    const field = ctx.message.text;
    if (['Название контакта', 'Значение контакта'].includes(field)) {
      tempData[ctx.from.id].field = field === 'Название контакта' ? 'name' : 'value';
      userStates.set(ctx.from.id, 'edit_contact_value');
      return ctx.reply('Введите новое значение:');
    } else {
      return ctx.reply('Выберите из предложенных вариантов.');
    }
  } else if (state === 'edit_contact_value') {
    const { index, field } = tempData[ctx.from.id];
    contacts[index][field] = ctx.message.text;
    delete tempData[ctx.from.id];
    userStates.set(ctx.from.id, 'default');
    return ctx.reply('Контакт успешно изменён.');
  }

  if (state.startsWith('replying_')) {
    const feedbackId = parseInt(state.split('_')[1]);
    const feedback = feedbacks[feedbackId];
    if (feedback) {
      await bot.telegram.sendMessage(feedback.from, `Ответ от администрации:\n${ctx.message.text}`);
      feedback.answered = true;
      ctx.reply('Ответ отправлен.');
    }
    userStates.set(ctx.from.id, 'default');
    return;
  }

  if (state === 'add_mod') {
    const modId = parseInt(ctx.message.text);
    const mod = users.get(modId);
    if (mod) {
      mod.role = roles.MODERATOR;
      ctx.reply('Модератор добавлен.');
    } else {
      ctx.reply('Пользователь не найден.');
    }
    userStates.set(ctx.from.id, 'default');
    return;
  }

  next();
});

bot.action(/reply_(\d+)/, async (ctx) => {
  const id = parseInt(ctx.match[1]);
  const feedback = feedbacks[id];
  if (!feedback) return ctx.reply('Сообщение не найдено.');
  userStates.set(ctx.from.id, `replying_${id}`);
  ctx.reply('Введите ответ пользователю:');
});

bot.hears('🛠 Админ панель', async (ctx) => {
  if (!isAdmin(ctx)) return ctx.reply('Нет доступа.');
  userStates.set(ctx.from.id, 'admin_panel');
  if (ctx.message?.message_id) {
    try {
      await ctx.deleteMessage(ctx.message.message_id);
    } catch (err) {
      console.error('Ошибка при удалении сообщения:', err.message);
    }
  }
  ctx.reply('Админ панель', Markup.inlineKeyboard([
    [Markup.button.callback('📨 Сообщения', 'admin_messages')],
    [Markup.button.callback('📦 Управление товарами', 'admin_products')],
    [Markup.button.callback('📞 Управление контактами', 'admin_contacts')],
    ...(isOwner(ctx) ? [[Markup.button.callback('👤 Модераторы', 'admin_moderators')]] : [])
  ]));
});

bot.action('admin_messages', async (ctx) => {
  const pending = feedbacks.filter(f => !f.answered);
  const all = feedbacks.length;
  await ctx.editMessageText(`Всего сообщений: ${all}\nНеотвеченных: ${pending.length}`, Markup.inlineKeyboard([
    [Markup.button.callback('🔙 Назад', 'back_to_admin')]
  ]));
  pending.forEach((f) => {
    const username = users.get(f.from)?.username || f.from;
    const time = f.date.toLocaleString();
    bot.telegram.sendMessage(ctx.from.id, `📨 Сообщение от @${username}\n📅 Дата: ${time}`,
      Markup.inlineKeyboard([
        [Markup.button.callback('Ответить', `reply_${feedbacks.indexOf(f)}`)]
      ]));
    bot.telegram.copyMessage(ctx.from.id, f.from, f.msg.message_id);
  });
});

bot.action('admin_contacts', async (ctx) => {
  await ctx.editMessageText('Контакты:', Markup.inlineKeyboard([
    [Markup.button.callback('➕ Добавить', 'add_contact')],
    [Markup.button.callback('✏️ Редактировать контакт', 'edit_contact')],
    [Markup.button.callback('🔙 Назад', 'back_to_admin')]
  ]));
});

bot.action('edit_contact', async (ctx) => {
  userStates.set(ctx.from.id, 'edit_contact_select');
  let msg = 'Выберите номер контакта для изменения:\n';
  contacts.forEach((c, i) => msg += `${i + 1}. ${c.name}: ${c.value}\n`);
  ctx.reply(msg);
});

bot.action('back_to_admin', async (ctx) => {
  await ctx.editMessageText('Админ панель', Markup.inlineKeyboard([
    [Markup.button.callback('📨 Сообщения', 'admin_messages')],
    [Markup.button.callback('📦 Управление товарами', 'admin_products')],
    [Markup.button.callback('📞 Управление контактами', 'admin_contacts')],
    ...(isOwner(ctx) ? [[Markup.button.callback('👤 Модераторы', 'admin_moderators')]] : [])
  ]));
});

bot.launch();

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
