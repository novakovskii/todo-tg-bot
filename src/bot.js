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
// taskId -> { chatId, messageId } for reverse lookup (delete old messages)
const taskMessageMap = new Map();

function getTodos(chatId) {
  if (!todos.has(chatId)) todos.set(chatId, []);
  return todos.get(chatId);
}

function taskText(task) {
  return `${task.done ? '✅' : '✴️'} ${task.text}`;
}

async function sendTaskMessage(chatId, task) {
  const msg = await bot.api.sendMessage(chatId, taskText(task));
  const key = `${chatId}_${msg.message_id}`;
  messageTaskMap.set(key, task.id);
  taskMessageMap.set(task.id, { chatId, messageId: msg.message_id });
}

function updateTaskMessage(chatId, messageId, task) {
  return bot.api.editMessageText(chatId, messageId, taskText(task));
}

// /start
bot.command('start', (ctx) => {
  ctx.reply('Привет! Отправь мне текст — я создам задачу.');
});

// Forwarded messages — re-send tasks and delete old ones
bot.on('message:forward_origin', async (ctx) => {
  const chatId = ctx.chat.id;
  const list = getTodos(chatId);
  const fwdText = ctx.message.text;
  if (!fwdText) return;

  // Find task matching the forwarded text
  const task = list.find((t) => taskText(t) === fwdText);
  if (!task) return;

  // Delete the old bot message
  const old = taskMessageMap.get(task.id);
  if (old) {
    const oldKey = `${old.chatId}_${old.messageId}`;
    messageTaskMap.delete(oldKey);
    bot.api.deleteMessage(old.chatId, old.messageId).catch(() => {});
  }

  // Delete the forwarded message
  ctx.deleteMessage().catch(() => {});

  // Re-send the task (appears at the bottom)
  await sendTaskMessage(chatId, task);
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

// Reaction: toggle task
bot.on('message_reaction', async (ctx) => {
  const chatId = ctx.chat.id;
  const messageId = ctx.messageReaction.message_id;
  const key = `${chatId}_${messageId}`;
  const taskId = messageTaskMap.get(key);

  if (!taskId) return;

  const list = getTodos(chatId);
  const task = list.find((t) => t.id === taskId);

  if (!task) return;

  task.done = !task.done;
  updateTaskMessage(chatId, messageId, task);
});

bot.start({
  allowed_updates: ['message', 'message_reaction'],
});
console.log('Bot is running...');
