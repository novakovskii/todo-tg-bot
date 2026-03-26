const { Bot } = require('grammy');

const token = process.env.BOT_TOKEN;
if (!token) {
  console.error('BOT_TOKEN is not set');
  process.exit(1);
}

const bot = new Bot(token);

// In-memory storage: chatId -> [{ id, text, done }]
const todos = new Map();
// messageId -> taskId mapping for reaction handling
const messageTaskMap = new Map();

function getTodos(chatId) {
  if (!todos.has(chatId)) todos.set(chatId, []);
  return todos.get(chatId);
}

function taskText(task) {
  return `${task.done ? '✅' : '✴️'} ${task.text}`;
}

async function sendTaskMessage(chatId, task) {
  const msg = await bot.api.sendMessage(chatId, taskText(task));
  messageTaskMap.set(`${chatId}_${msg.message_id}`, task.id);
}

function updateTaskMessage(chatId, messageId, task) {
  return bot.api.editMessageText(chatId, messageId, taskText(task));
}

// /start
bot.command('start', (ctx) => {
  ctx.reply('Привет! Отправь мне текст — я создам задачу.');
});

// Any text message — add task(s), one per line
bot.on('message:text', async (ctx) => {
  const list = getTodos(ctx.chat.id);
  const lines = ctx.message.text.split('\n').filter((l) => l.trim());

  ctx.deleteMessage().catch(() => {});

  for (const line of lines) {
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const task = { id, text: line.trim(), done: false };
    list.push(task);
    await sendTaskMessage(ctx.chat.id, task);
  }
});

// Reaction: 👍 toggles status, 👌 re-sends (moves to today)
bot.on('message_reaction', async (ctx) => {
  const chatId = ctx.chat.id;
  const messageId = ctx.messageReaction.message_id;
  const key = `${chatId}_${messageId}`;
  const taskId = messageTaskMap.get(key);

  if (!taskId) return;

  const list = getTodos(chatId);
  const task = list.find((t) => t.id === taskId);

  if (!task) return;

  const newEmojis = ctx.messageReaction.new_reaction
    .filter((r) => r.type === 'emoji')
    .map((r) => r.emoji);

  if (newEmojis.includes('👍')) {
    task.done = !task.done;
    updateTaskMessage(chatId, messageId, task);
  } else if (newEmojis.includes('👌')) {
    messageTaskMap.delete(key);
    bot.api.deleteMessage(chatId, messageId).catch(() => {});
    task.done = false;
    await sendTaskMessage(chatId, task);
  }
});

bot.start({
  allowed_updates: ['message', 'message_reaction'],
});
console.log('Bot is running...');
