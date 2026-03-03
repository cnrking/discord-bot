// =============================================
// TRACE PC TWEAK - Discord Bot + Key API
// discord.js v14 | Slash Commands | DM Only
// Only responds to: 357223263757271052
// =============================================

const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

// ========== CONFIG ==========
const CONFIG = {
    OWNER_ID: '357223263757271052',
    BOT_TOKEN: process.env.BOT_TOKEN || 'YOUR_BOT_TOKEN_HERE',
    CLIENT_ID: process.env.CLIENT_ID || '1478113240025272595',
    API_PORT: process.env.PORT || 3001,
    KEYS_FILE: path.join(__dirname, 'keys.json')
};

// ========== KEY DATABASE ==========
class KeyDatabase {
    constructor() {
        this.data = this.load();
    }

    load() {
        try {
            if (fs.existsSync(CONFIG.KEYS_FILE)) {
                return JSON.parse(fs.readFileSync(CONFIG.KEYS_FILE, 'utf8'));
            }
        } catch (e) { }
        return { keys: {} };
    }

    save() {
        fs.writeFileSync(CONFIG.KEYS_FILE, JSON.stringify(this.data, null, 2), 'utf8');
    }

    getPlanDays(plan) {
        switch (plan) {
            case 'week': return 7;
            case 'month': return 30;
            case '3month': return 90;
            case 'lifetime': return null;
            case 'admin': return null;
            default: return 30;
        }
    }

    getPlanName(plan) {
        switch (plan) {
            case 'week': return 'Week';
            case 'month': return 'Month';
            case '3month': return '3 Month';
            case 'lifetime': return 'Lifetime';
            case 'admin': return 'Admin';
            default: return plan;
        }
    }

    generateKey(plan) {
        const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
        let key;
        do {
            const parts = [];
            for (let p = 0; p < 3; p++) {
                let segment = '';
                for (let i = 0; i < 4; i++) {
                    segment += chars[crypto.randomInt(chars.length)];
                }
                parts.push(segment);
            }
            key = 'TRACE-' + parts.join('-');
        } while (this.data.keys[key]);

        const days = this.getPlanDays(plan);
        const now = new Date();

        this.data.keys[key] = {
            plan: plan,
            createdAt: now.toISOString(),
            expiresAt: days ? new Date(now.getTime() + days * 86400000).toISOString() : null,
            daysTotal: days,
            hwid: plan === 'admin' ? [] : null,
            activatedAt: null,
            activated: false,
            disabled: false
        };

        this.save();
        return key;
    }

    deleteKey(key) {
        key = key.toUpperCase();
        if (!this.data.keys[key]) return { success: false, message: 'Key bulunamadi.' };
        delete this.data.keys[key];
        this.save();
        return { success: true, message: '`' + key + '` silindi.' };
    }

    addTime(key, days) {
        key = key.toUpperCase();
        const k = this.data.keys[key];
        if (!k) return { success: false, message: 'Key bulunamadi.' };
        if (k.plan === 'lifetime' || k.plan === 'admin') return { success: false, message: 'Lifetime/Admin keye sure eklenemez.' };

        if (k.expiresAt) {
            const current = new Date(k.expiresAt);
            k.expiresAt = new Date(current.getTime() + days * 86400000).toISOString();
        } else {
            k.expiresAt = new Date(Date.now() + days * 86400000).toISOString();
        }
        k.daysTotal = (k.daysTotal || 0) + days;
        this.save();
        return { success: true, message: '`' + key + '` -> +' + days + ' gun eklendi. Yeni bitis: ' + k.expiresAt.split('T')[0] };
    }

    reduceTime(key, days) {
        key = key.toUpperCase();
        const k = this.data.keys[key];
        if (!k) return { success: false, message: 'Key bulunamadi.' };
        if (k.plan === 'lifetime' || k.plan === 'admin') return { success: false, message: 'Lifetime/Admin keyden sure azaltilamaz.' };

        if (k.expiresAt) {
            const current = new Date(k.expiresAt);
            const newDate = new Date(current.getTime() - days * 86400000);
            if (newDate < new Date()) {
                k.expiresAt = new Date().toISOString();
                k.disabled = true;
            } else {
                k.expiresAt = newDate.toISOString();
            }
        }
        this.save();
        return { success: true, message: '`' + key + '` -> -' + days + ' gun. Bitis: ' + (k.expiresAt ? k.expiresAt.split('T')[0] : 'N/A') };
    }

    resetHWID(key) {
        key = key.toUpperCase();
        const k = this.data.keys[key];
        if (!k) return { success: false, message: 'Key bulunamadi.' };
        k.hwid = k.plan === 'admin' ? [] : null;
        k.activated = false;
        k.activatedAt = null;
        this.save();
        return { success: true, message: '`' + key + '` HWID sifirlandi.' };
    }

    disableKey(key) {
        key = key.toUpperCase();
        const k = this.data.keys[key];
        if (!k) return { success: false, message: 'Key bulunamadi.' };
        k.disabled = !k.disabled;
        this.save();
        return { success: true, message: '`' + key + '` ' + (k.disabled ? 'devre disi' : 'aktif') + '.' };
    }

    getKeyInfo(key) {
        key = key.toUpperCase();
        return this.data.keys[key] ? { key, ...this.data.keys[key] } : null;
    }

    listKeys() {
        return Object.entries(this.data.keys).map(([key, d]) => ({
            key,
            plan: d.plan,
            hwid: Array.isArray(d.hwid) ? d.hwid.map(h => h.substring(0, 8)).join(', ') || 'Bos' : (d.hwid ? d.hwid.substring(0, 8) + '...' : 'Bos'),
            activated: d.activated,
            disabled: d.disabled,
            expiresAt: d.expiresAt ? d.expiresAt.split('T')[0] : 'inf',
            daysLeft: d.expiresAt ? Math.max(0, Math.ceil((new Date(d.expiresAt) - new Date()) / 86400000)) : 'inf'
        }));
    }

    validateKey(key, hwid) {
        key = key.toUpperCase();
        const k = this.data.keys[key];

        if (!k) return { success: false, message: 'Bu key gecersiz.' };
        if (k.disabled) return { success: false, message: 'Bu key devre disi birakilmis.' };
        if (k.expiresAt && new Date(k.expiresAt) < new Date()) return { success: false, message: 'Bu keyin suresi dolmus.' };

        // Admin key: 2 HWID
        if (k.plan === 'admin') {
            if (!Array.isArray(k.hwid)) k.hwid = [];
            if (k.hwid.indexOf(hwid) === -1) {
                if (k.hwid.length >= 2) {
                    return { success: false, message: 'Admin key 2 cihaza bagli. Baska cihazda kullanilamaz.' };
                }
                k.hwid.push(hwid);
                k.activated = true;
                k.activatedAt = new Date().toISOString();
                this.save();
            }
        } else {
            if (k.hwid && k.hwid !== hwid) return { success: false, message: 'Bu key baska bir bilgisayara bagli.' };
            if (!k.hwid) {
                k.hwid = hwid;
                k.activated = true;
                k.activatedAt = new Date().toISOString();
                this.save();
            }
        }

        return { success: true, plan: k.plan, expiresAt: k.expiresAt, message: 'Lisans dogrulandi.' };
    }
}

const db = new KeyDatabase();

// ========== EXPRESS API ==========
const api = express();
api.use(cors());
api.use(express.json());

api.post('/api/validate', (req, res) => {
    const { key, hwid } = req.body;
    if (!key || !hwid) return res.json({ success: false, message: 'Key ve HWID gerekli.' });
    res.json(db.validateKey(key, hwid));
});

api.get('/api/health', (req, res) => {
    res.json({ status: 'ok', totalKeys: Object.keys(db.data.keys).length });
});

api.post('/api/checkkey', (req, res) => {
    const { key, hwid } = req.body;
    if (!key || !hwid) return res.json({ success: false });
    const k = db.data.keys[key.toUpperCase()];
    if (!k) return res.json({ success: false, deleted: true });
    if (k.disabled) return res.json({ success: false, deleted: true });
    // HWID check
    if (k.plan === 'admin') {
        if (Array.isArray(k.hwid) && k.hwid.indexOf(hwid) === -1) return res.json({ success: false });
    } else {
        if (k.hwid && k.hwid !== hwid) return res.json({ success: false });
    }
    const expired = k.expiresAt && new Date(k.expiresAt) < new Date();
    if (expired) return res.json({ success: false, expired: true });
    res.json({
        success: true,
        activated: k.activated,
        plan: k.plan,
        expiresAt: k.expiresAt,
        daysLeft: k.expiresAt ? Math.max(0, Math.ceil((new Date(k.expiresAt) - new Date()) / 86400000)) : null
    });
});

api.listen(CONFIG.API_PORT, '0.0.0.0', () => {
    console.log('[API] Key API running on port ' + CONFIG.API_PORT);
});

// ========== DISCORD BOT ==========
const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.DirectMessages]
});

// ========== SLASH COMMANDS ==========
const commands = [
    new SlashCommandBuilder()
        .setName('genkey')
        .setDescription('Generate new license key')
        .addStringOption(opt =>
            opt.setName('plan')
                .setDescription('License plan')
                .setRequired(true)
                .addChoices(
                    { name: 'Week (7 days)', value: 'week' },
                    { name: 'Month (30 days)', value: 'month' },
                    { name: '3 Month (90 days)', value: '3month' },
                    { name: 'Lifetime', value: 'lifetime' },
                    { name: 'Admin (Lifetime + 2 HWID)', value: 'admin' }
                )),

    new SlashCommandBuilder()
        .setName('deletekey')
        .setDescription('Delete a key')
        .addStringOption(opt =>
            opt.setName('key').setDescription('Key to delete').setRequired(true)),

    new SlashCommandBuilder()
        .setName('addtime')
        .setDescription('Add time to a key')
        .addStringOption(opt =>
            opt.setName('key').setDescription('Key').setRequired(true))
        .addStringOption(opt =>
            opt.setName('period').setDescription('Period to add').setRequired(true)
                .addChoices(
                    { name: 'Week (+7 days)', value: 'week' },
                    { name: 'Month (+30 days)', value: 'month' },
                    { name: '3 Month (+90 days)', value: '3month' }
                )),

    new SlashCommandBuilder()
        .setName('reducetime')
        .setDescription('Reduce time from a key')
        .addStringOption(opt =>
            opt.setName('key').setDescription('Key').setRequired(true))
        .addStringOption(opt =>
            opt.setName('period').setDescription('Period to reduce').setRequired(true)
                .addChoices(
                    { name: 'Week (-7 days)', value: 'week' },
                    { name: 'Month (-30 days)', value: 'month' },
                    { name: '3 Month (-90 days)', value: '3month' }
                )),

    new SlashCommandBuilder()
        .setName('keyinfo')
        .setDescription('View key info')
        .addStringOption(opt =>
            opt.setName('key').setDescription('Key').setRequired(true)),

    new SlashCommandBuilder()
        .setName('listkeys')
        .setDescription('List all keys'),

    new SlashCommandBuilder()
        .setName('resethwid')
        .setDescription('Reset key HWID binding')
        .addStringOption(opt =>
            opt.setName('key').setDescription('Key').setRequired(true)),

    new SlashCommandBuilder()
        .setName('disablekey')
        .setDescription('Toggle key active/disabled')
        .addStringOption(opt =>
            opt.setName('key').setDescription('Key').setRequired(true))
];

// ========== BOT READY ==========
client.once('ready', async () => {
    console.log('[BOT] ' + client.user.tag + ' logged in');
    console.log('[BOT] Mode: DM Only | Owner: ' + CONFIG.OWNER_ID);

    const rest = new REST({ version: '10' }).setToken(CONFIG.BOT_TOKEN);
    try {
        console.log('[BOT] Registering slash commands...');
        await rest.put(Routes.applicationCommands(CONFIG.CLIENT_ID), {
            body: commands.map(c => c.toJSON())
        });
        console.log('[BOT] Slash commands registered');
    } catch (err) {
        console.error('[BOT] Command registration error:', err.message);
    }
});

// ========== COMMAND HANDLER ==========
client.on('interactionCreate', async (interaction) => {
    if (!interaction.isChatInputCommand()) return;

    if (interaction.guild) {
        return interaction.reply({ content: 'This bot only works in DM.', ephemeral: true });
    }

    if (interaction.user.id !== CONFIG.OWNER_ID) {
        return interaction.reply({ content: 'Unauthorized.', ephemeral: true });
    }

    const cmd = interaction.commandName;

    try {
        switch (cmd) {
            case 'genkey': {
                const plan = interaction.options.getString('plan');
                const key = db.generateKey(plan);
                const days = db.getPlanDays(plan);
                const planName = db.getPlanName(plan);

                const embed = new EmbedBuilder()
                    .setColor(0xe04040)
                    .setTitle('New Key Generated')
                    .addFields(
                        { name: 'KEY', value: '```' + key + '```', inline: false },
                        { name: 'Plan', value: planName, inline: true },
                        { name: 'Duration', value: days ? days + ' days' : 'Unlimited', inline: true },
                        { name: 'Expires', value: days ? new Date(Date.now() + days * 86400000).toISOString().split('T')[0] : 'Never', inline: true },
                        { name: 'HWID', value: plan === 'admin' ? 'Max 2 devices' : 'Not bound yet', inline: true }
                    )
                    .setFooter({ text: 'Trace PC Tweak' })
                    .setTimestamp();

                await interaction.reply({ embeds: [embed] });
                break;
            }

            case 'deletekey': {
                const result = db.deleteKey(interaction.options.getString('key'));
                await interaction.reply({
                    embeds: [
                        new EmbedBuilder()
                            .setColor(result.success ? 0x2ecc71 : 0xe74c3c)
                            .setTitle(result.success ? 'Deleted' : 'Error')
                            .setDescription(result.message)
                            .setTimestamp()
                    ]
                });
                break;
            }

            case 'addtime': {
                const period = interaction.options.getString('period');
                const days = db.getPlanDays(period) || 7;
                const periodName = db.getPlanName(period);
                const result = db.addTime(interaction.options.getString('key'), days);
                if (result.success) result.message += ' (+' + periodName + ')';
                await interaction.reply({
                    embeds: [
                        new EmbedBuilder()
                            .setColor(result.success ? 0x2ecc71 : 0xe74c3c)
                            .setTitle(result.success ? '+ Time Added' : 'Error')
                            .setDescription(result.message)
                            .setTimestamp()
                    ]
                });
                break;
            }

            case 'reducetime': {
                const period = interaction.options.getString('period');
                const days = db.getPlanDays(period) || 7;
                const periodName = db.getPlanName(period);
                const result = db.reduceTime(interaction.options.getString('key'), days);
                if (result.success) result.message += ' (-' + periodName + ')';
                await interaction.reply({
                    embeds: [
                        new EmbedBuilder()
                            .setColor(result.success ? 0xf39c12 : 0xe74c3c)
                            .setTitle(result.success ? '- Time Reduced' : 'Error')
                            .setDescription(result.message)
                            .setTimestamp()
                    ]
                });
                break;
            }

            case 'keyinfo': {
                const info = db.getKeyInfo(interaction.options.getString('key'));
                if (!info) {
                    return interaction.reply({
                        embeds: [
                            new EmbedBuilder().setColor(0xe74c3c).setTitle('Not Found').setDescription('Key not registered.')
                        ]
                    });
                }

                const daysLeft = info.expiresAt ? Math.max(0, Math.ceil((new Date(info.expiresAt) - new Date()) / 86400000)) : 'inf';
                const planName = db.getPlanName(info.plan);
                let status = 'Pending';
                if (info.disabled) status = 'Disabled';
                else if (info.activated) status = 'Active';

                let hwidDisplay = 'Not bound';
                if (info.plan === 'admin' && Array.isArray(info.hwid)) {
                    hwidDisplay = info.hwid.length > 0 ? info.hwid.join(', ') : 'Not bound';
                } else if (info.hwid) {
                    hwidDisplay = info.hwid;
                }

                await interaction.reply({
                    embeds: [
                        new EmbedBuilder()
                            .setColor(info.disabled ? 0xe74c3c : info.activated ? 0x2ecc71 : 0xf39c12)
                            .setTitle('Key Info')
                            .addFields(
                                { name: 'Key', value: '`' + info.key + '`', inline: false },
                                { name: 'Plan', value: planName, inline: true },
                                { name: 'Status', value: status, inline: true },
                                { name: 'Remaining', value: daysLeft + ' days', inline: true },
                                { name: 'HWID', value: hwidDisplay, inline: true },
                                { name: 'Activated', value: info.activatedAt ? info.activatedAt.split('T')[0] : '-', inline: true },
                                { name: 'Expires', value: info.expiresAt ? info.expiresAt.split('T')[0] : 'Never', inline: true }
                            )
                            .setFooter({ text: 'Trace PC Tweak' })
                            .setTimestamp()
                    ]
                });
                break;
            }

            case 'listkeys': {
                const keys = db.listKeys();
                if (keys.length === 0) {
                    return interaction.reply({
                        embeds: [
                            new EmbedBuilder().setColor(0xf39c12).setTitle('Key List').setDescription('No keys found.')
                        ]
                    });
                }

                const lines = keys.map(k => {
                    const icon = k.disabled ? '[X]' : k.activated ? '[OK]' : '[--]';
                    const planName = db.getPlanName(k.plan);
                    return icon + ' `' + k.key + '` | **' + planName + '** | HWID: ' + k.hwid + ' | Left: ' + k.daysLeft;
                });

                const chunks = [];
                let current = '';
                for (const line of lines) {
                    if ((current + '\n' + line).length > 3900) {
                        chunks.push(current);
                        current = line;
                    } else {
                        current += (current ? '\n' : '') + line;
                    }
                }
                if (current) chunks.push(current);

                const embeds = chunks.map((desc, i) =>
                    new EmbedBuilder()
                        .setColor(0xe04040)
                        .setTitle(i === 0 ? 'Key List (' + keys.length + ' total)' : 'Continued')
                        .setDescription(desc)
                        .setTimestamp()
                );

                await interaction.reply({ embeds: embeds.slice(0, 10) });
                break;
            }

            case 'resethwid': {
                const result = db.resetHWID(interaction.options.getString('key'));
                await interaction.reply({
                    embeds: [
                        new EmbedBuilder()
                            .setColor(result.success ? 0x3498db : 0xe74c3c)
                            .setTitle(result.success ? 'HWID Reset' : 'Error')
                            .setDescription(result.message)
                            .setTimestamp()
                    ]
                });
                break;
            }

            case 'disablekey': {
                const result = db.disableKey(interaction.options.getString('key'));
                await interaction.reply({
                    embeds: [
                        new EmbedBuilder()
                            .setColor(result.success ? 0xf39c12 : 0xe74c3c)
                            .setTitle(result.success ? 'Status Changed' : 'Error')
                            .setDescription(result.message)
                            .setTimestamp()
                    ]
                });
                break;
            }
        }
    } catch (error) {
        console.error('[BOT] Error:', error);
        const msg = { content: 'Error: ' + error.message, ephemeral: true };
        if (interaction.replied || interaction.deferred) await interaction.followUp(msg);
        else await interaction.reply(msg);
    }
});

// ========== START ==========
client.login(CONFIG.BOT_TOKEN);
