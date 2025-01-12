// server.js
require('dotenv').config();
const express = require('express');
const multer = require('multer');
const TelegramBot = require('node-telegram-bot-api');
const path = require('path');
const fs = require('fs');

// Инициализация Express
const app = express();

// Инициализация Telegram бота
const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: false });
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

// Авторизованные пользователи (используются, если реализуем команды для бота)
const AUTHORIZED_USER_IDS = process.env.AUTHORIZED_USER_IDS
  ? process.env.AUTHORIZED_USER_IDS.split(',').map(id => id.trim())
  : [];

// Создание папки uploads, если она не существует
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)){
    fs.mkdirSync(uploadDir);
}

// Настройка Multer для обработки загрузки файлов
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, 'uploads/');
    },
    filename: function (req, file, cb) {
        // Генерация уникального имени файла
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const sanitizedFilename = file.originalname.replace(/[^a-zA-Z0-9.\-_]/g, '');
        cb(null, uniqueSuffix + '-' + sanitizedFilename);
    }
});
const upload = multer({ 
    storage: storage,
    limits: { fileSize: 10 * 1024 * 1024 }, // Максимальный размер файла: 10MB
});

// Middleware для обработки JSON и URL-encoded данных
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Статика для доступа к загруженным файлам
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Маршрут для обработки формы
app.post('/submit', upload.array('files[]', 10), async (req, res) => {
    try {
        const data = req.body;
        const files = req.files;

        // Формирование сообщения
        let message = `📄 *Новая заявка*:\n\n`;
        message += `*Имя:* ${data.Имя}\n`;
        message += `*Телефон:* ${data.Телефон}\n`;
        if (data['E-mail']) {
            message += `*Почта:* ${data['E-mail']}\n`;
        }
        if (data.Комментарий) {
            message += `*Комментарий:* ${data.Комментарий}\n`;
        }
        if (data['Итоговая строка калькулятора с ценой']) {
            message += `*Итого:* ${data['Итоговая строка калькулятора с ценой']}\n`;
        }

        // Добавление информации о файлах
        if (files && files.length > 0) {
            message += `\n📎 *Файлы:*\n`;
            files.forEach((file, index) => {
                const fileUrl = `${req.protocol}://${req.get('host')}/${file.path}`;
                message += `${index + 1}. [${file.originalname}](${fileUrl})\n`;
            });
        }

        // Отправка сообщения в Telegram
        await bot.sendMessage(TELEGRAM_CHAT_ID, message, { parse_mode: 'Markdown' });

        // Отправка файлов в Telegram как документы
        if (files && files.length > 0) {
            for (const file of files) {
                await bot.sendDocument(TELEGRAM_CHAT_ID, fs.createReadStream(file.path), {}, { filename: file.originalname });
                // Удаление файла после отправки (опционально)
                fs.unlink(file.path, (err) => {
                    if (err) console.error(`Ошибка при удалении файла ${file.path}:`, err);
                });
            }
        }

        res.status(200).send('Заявка успешно отправлена!');
    } catch (error) {
        console.error('Ошибка при обработке заявки:', error);
        res.status(500).send('Произошла ошибка при обработке заявки.');
    }
});

// Запуск сервера
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Сервер запущен на порту ${PORT}`);
});

// Взаимодействие бота с пользователями (ограничение доступа)
if (AUTHORIZED_USER_IDS.length > 0) {
    bot.on('message', (msg) => {
        const userId = msg.from.id;
        if (!AUTHORIZED_USER_IDS.includes(userId.toString())) {
            // Игнорировать сообщения от неавторизованных пользователей
            if (msg.text && msg.text.startsWith('/')) {
                bot.sendMessage(userId, "У вас нет доступа к этому боту.");
            }
            return;
        }

        // Здесь можно добавить дополнительные команды или обработчики для авторизованных пользователей
        // Например, команда /start
        if (msg.text === '/start') {
            bot.sendMessage(userId, "Добро пожаловать! Вы авторизованный пользователь.");
        }
    });
}
