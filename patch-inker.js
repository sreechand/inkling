const fs = require('fs');

const mainPath = process.env.INKER_MAIN_JS || '/app/dist/main.js';
let source = fs.readFileSync(mainPath, 'utf8');
const googleCalendarPluginPath = process.env.GOOGLE_CALENDAR_PLUGIN_JSON || '/tmp/google-calendar-plugin.json';
const googleCalendarPlugin = JSON.parse(fs.readFileSync(googleCalendarPluginPath, 'utf8'));
const secondHeartPlugin = JSON.parse(fs.readFileSync(process.env.SECOND_HEART_PLUGIN_JSON || '/tmp/second-heart-plugin.json', 'utf8'));

function patchResolutionPreset() {
  const assetsDir = process.env.INKER_FRONTEND_ASSETS || '/usr/share/nginx/html/assets';
  const from = '{label:"TRMNL X Portrait",width:1404,height:1872,description:"1404 x 1872 px (portrait)"}';
  const to = '{label:"Kindle Voyage",width:1072,height:1448,description:"1072 x 1448 px (portrait)"}';
  let matched = false;

  for (const filename of fs.readdirSync(assetsDir).filter((name) => name.endsWith('.js'))) {
    const assetPath = `${assetsDir}/${filename}`;
    const asset = fs.readFileSync(assetPath, 'utf8');
    if (asset.includes(to)) {
      console.log(`Kindle Voyage resolution preset: already patched in ${filename}`);
      matched = true;
      continue;
    }
    if (!asset.includes(from)) continue;

    fs.writeFileSync(assetPath, asset.replace(from, to));
    console.log(`Kindle Voyage resolution preset: patched in ${filename}`);
    matched = true;
  }

  if (!matched) {
    throw new Error('Kindle Voyage resolution preset: could not find expected frontend source block');
  }
}

patchResolutionPreset();

function replaceOnce(label, from, to) {
  if (source.includes(to)) {
    console.log(`${label}: already patched`);
    return;
  }
  if (!source.includes(from)) {
    throw new Error(`${label}: could not find expected source block`);
  }
  source = source.replace(from, to);
  console.log(`${label}: patched`);
}

replaceOnce(
  'display image base URL',
  `const apiUrl = baseUrl || this.config.get('api.url', 'http://localhost:3002');`,
  `const apiUrl = (baseUrl || this.config.get('api.url', 'http://localhost:3002')).replace(/\\/api\\/?$/, '');`,
);

replaceOnce(
  'setup image base URL',
  `const apiUrl = baseUrl || process.env.API_URL || 'http://localhost:3002';`,
  `const apiUrl = (baseUrl || process.env.API_URL || 'http://localhost:3002').replace(/\\/api\\/?$/, '');`,
);

const todoistDataTransform = `const token = settings.api_token;
if (!token) throw new Error('Missing Todoist API token');
const query = settings.query || 'today | overdue';
const limit = Math.max(1, Math.min(24, Number(settings.limit || 12)));
const lang = settings.lang || 'en';
const timezone = settings.timezone || 'UTC';
const params = new URLSearchParams({ query, limit: String(Math.min(200, Math.max(limit, 50))) });
if (lang) params.set('lang', lang);
const response = await fetch('https://api.todoist.com/api/v1/tasks/filter?' + params.toString(), {
  headers: {
    Authorization: 'Bearer ' + token,
    Accept: 'application/json'
  },
  signal: AbortSignal.timeout(15000)
});
if (!response.ok) {
  let detail = response.statusText;
  try {
    const errorBody = await response.json();
    detail = errorBody.error || errorBody.error_tag || detail;
  } catch (_) {}
  throw new Error('Todoist HTTP ' + response.status + ': ' + detail);
}
const body = await response.json();
const allTasks = Array.isArray(body.results) ? body.results : (Array.isArray(body.items) ? body.items : []);
const tasks = allTasks.slice(0, limit).map((task) => {
  const due = task.due || task.deadline || null;
  const priorityNumber = Number(task.priority || 1);
  return {
    id: task.id,
    content: task.content || '(Untitled task)',
    description: task.description || '',
    due: due ? (due.string || due.date || '') : '',
    due_date: due ? (due.date || '') : '',
    priority: priorityNumber,
    priority_label: priorityNumber >= 4 ? 'P1' : priorityNumber === 3 ? 'P2' : priorityNumber === 2 ? 'P3' : '',
    labels: Array.isArray(task.labels) ? task.labels.join(', ') : '',
    project_id: task.project_id || ''
  };
});
const today = new Intl.DateTimeFormat('en-CA', {
  timeZone: timezone,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit'
}).format(new Date());
const overdue = tasks.filter((task) => task.due_date && /^\\d{4}-\\d{2}-\\d{2}$/.test(task.due_date) && task.due_date < today).length;
const updated_at = new Intl.DateTimeFormat('en-US', {
  timeZone: timezone,
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit'
}).format(new Date());
return {
  title: settings.title || 'Todoist',
  query,
  total: allTasks.length,
  shown: tasks.length,
  remaining: Math.max(0, allTasks.length - tasks.length),
  overdue,
  updated_at,
  tasks
};`;

const todoistMarkupFull = `<div class="view view--full" style="background:#fff;color:#111;">
  <div class="layout" style="height:100%;padding:54px 58px 42px 58px;display:flex;flex-direction:column;gap:28px;box-sizing:border-box;">
    <div style="display:flex;align-items:flex-start;justify-content:space-between;border-bottom:5px solid #111;padding-bottom:26px;">
      <div style="min-width:0;max-width:760px;">
        <div style="font-size:58px;font-weight:900;line-height:1;">{{ title }}</div>
        <div style="font-size:25px;margin-top:14px;color:#333;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">{{ query }}</div>
      </div>
      <div style="text-align:right;min-width:150px;">
        <div style="font-size:54px;font-weight:900;line-height:1;">{{ total }}</div>
        <div style="font-size:22px;color:#333;margin-top:6px;">tasks</div>
      </div>
    </div>

    <div style="display:flex;gap:14px;font-size:23px;font-weight:800;flex-wrap:wrap;">
      <span style="border:3px solid #111;padding:10px 16px;">showing {{ shown }}</span>
      {% if overdue > 0 %}<span style="border:3px solid #111;background:#111;color:#fff;padding:10px 16px;">{{ overdue }} overdue</span>{% endif %}
      {% if remaining > 0 %}<span style="border:3px solid #111;padding:10px 16px;">+{{ remaining }} more</span>{% endif %}
    </div>

    <div style="flex:1;display:flex;flex-direction:column;gap:0;overflow:hidden;">
      {% if tasks.size > 0 %}
        {% for task in tasks %}
          <div style="display:flex;gap:22px;border-bottom:2px solid #bbb;padding:18px 0;min-height:74px;box-sizing:border-box;">
            <div style="width:36px;height:36px;border:4px solid #111;border-radius:6px;flex:0 0 auto;margin-top:4px;"></div>
            <div style="flex:1;min-width:0;">
              <div style="font-size:32px;font-weight:800;line-height:1.16;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">{{ task.content }}</div>
              <div style="font-size:21px;color:#444;margin-top:8px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
                {% if task.priority_label %}<strong>{{ task.priority_label }}</strong>{% endif %}
                {% if task.due %}{% if task.priority_label %} | {% endif %}{{ task.due }}{% endif %}
                {% if task.labels %} | {{ task.labels }}{% endif %}
              </div>
            </div>
          </div>
        {% endfor %}
      {% else %}
        <div style="height:100%;display:flex;align-items:center;justify-content:center;text-align:center;border:4px dashed #888;">
          <div>
            <div style="font-size:54px;font-weight:900;">All clear</div>
            <div style="font-size:27px;margin-top:14px;color:#444;">No tasks match this Todoist filter.</div>
          </div>
        </div>
      {% endif %}
    </div>

    <div style="font-size:21px;color:#555;border-top:4px solid #111;padding-top:18px;display:flex;justify-content:space-between;gap:20px;">
      <span>Updated {{ updated_at }}</span>
      <span>Todoist via Inker</span>
    </div>
  </div>
</div>`;

const todoistPlugin = {
  name: 'Todoist Tasks',
  slug: 'todoist_tasks',
  description: 'Shows active Todoist tasks from a configurable Todoist filter. This is an independent Inker plugin and is not created by, affiliated with, or supported by Todoist.',
  icon: 'check-square',
  category: 'productivity',
  source: 'inker',
  sourceUrl: 'https://developer.todoist.com/api/v1/#tag/Tasks/operation/get_tasks_by_filter_api_v1_tasks_filter_get',
  isBuiltin: true,
  isInstalled: true,
  dataStrategy: 'polling',
  dataTransform: todoistDataTransform,
  refreshInterval: 300,
  markupFull: todoistMarkupFull,
  settingsSchema: [
    {
      key: 'api_token',
      label: 'Todoist API Token',
      type: 'password',
      encrypted: true,
      required: true,
      description: 'From Todoist Settings -> Integrations -> Developer.',
    },
    {
      key: 'query',
      label: 'Todoist Filter',
      type: 'text',
      default: 'today | overdue',
      required: false,
      description: 'Examples: today, overdue, today | overdue, #Work & today.',
    },
    {
      key: 'limit',
      label: 'Task Limit',
      type: 'number',
      default: 12,
      required: false,
    },
    {
      key: 'title',
      label: 'Title',
      type: 'text',
      default: 'Todoist',
      required: false,
    },
    {
      key: 'lang',
      label: 'Filter Language',
      type: 'text',
      default: 'en',
      required: false,
    },
    {
      key: 'timezone',
      label: 'Timezone',
      type: 'text',
      default: 'UTC',
      required: false,
    },
    {
      key: 'screen_width',
      label: 'Screen Width',
      type: 'number',
      default: 800,
      required: false,
    },
    {
      key: 'screen_height',
      label: 'Screen Height',
      type: 'number',
      default: 480,
      required: false,
    },
  ],
  version: '1.1.0',
};

replaceOnce(
  'plugin render dimensions',
  `const plugin = instance.plugin;
        const settings = this.getDecryptedSettings(instance);
        const { width, height } = this.getDimensionsForLayout(layout);`,
  `const plugin = instance.plugin;
        const settings = this.getDecryptedSettings(instance);
        const baseDimensions = this.getDimensionsForLayout(layout);
        const width = Number(settings.screen_width) || baseDimensions.width;
        const height = Number(settings.screen_height) || baseDimensions.height;`,
);

replaceOnce(
  'screen renderer plugin-service cache',
  `this._pluginRenderer = null;`,
  `this._pluginRenderer = null;
        this._pluginsService = null;`,
);

replaceOnce(
  'installed plugins as screen templates',
  `const plugins = await this.prisma.plugin.findMany({
            where: { isInstalled: true },
        });
        return plugins.map((plugin, index) => ({
            id: 20000 + plugin.id,
            name: plugin.name,
            description: plugin.description || '',
            category: 'Plugins',
            icon: plugin.icon || 'puzzle',
            config: {
                type: 'plugin',
                pluginId: plugin.id,
                pluginSlug: plugin.slug,
            },
        }));`,
  `const plugins = await this.prisma.plugin.findMany({
            where: { isInstalled: true },
            include: {
                instances: {
                    select: { id: true, name: true },
                    orderBy: { id: 'asc' },
                    take: 1,
                },
            },
        });
        return plugins.map((plugin) => {
            const firstInstance = plugin.instances?.[0] || null;
            return {
                id: 20000 + plugin.id,
                name: \`plugin-\${plugin.slug}\`,
                label: plugin.name,
                description: plugin.description || '',
                category: 'plugins',
                icon: plugin.icon || 'puzzle',
                defaultConfig: {
                    type: 'plugin',
                    pluginInstanceId: firstInstance?.id ?? null,
                    pluginId: plugin.id,
                    pluginSlug: plugin.slug,
                    layout: 'full',
                    settingsSchema: plugin.settingsSchema || [],
                },
                config: {
                    type: 'plugin',
                    pluginInstanceId: firstInstance?.id ?? null,
                    pluginId: plugin.id,
                    pluginSlug: plugin.slug,
                },
                minWidth: 200,
                minHeight: 120,
            };
        });`,
);

const todoistBuiltinsSource = `const builtins = [this.grafanaPluginDefinition(), ${JSON.stringify(todoistPlugin, null, 12)}];`;
const googleBuiltinsSource = `const builtins = [this.grafanaPluginDefinition(), ${JSON.stringify(todoistPlugin, null, 12)}, ${JSON.stringify(googleCalendarPlugin, null, 12)}, ${JSON.stringify(secondHeartPlugin, null, 12)}];`;

if (!source.includes(googleBuiltinsSource)) {
  replaceOnce(
    'seed todoist builtin',
    `const builtins = [this.grafanaPluginDefinition()];`,
    todoistBuiltinsSource,
  );
} else {
  console.log('seed todoist builtin: already patched');
}

replaceOnce(
  'seed Google Calendar builtin',
  todoistBuiltinsSource,
  googleBuiltinsSource,
);

if (!source.includes('oauthProvider: def.oauthProvider,')) {
  replaceOnce(
    'seed builtin update fields',
    `icon: def.icon,
                    version: def.version,`,
    `icon: def.icon,
                    version: def.version,
                    name: def.name,
                    category: def.category,
                    source: def.source,
                    sourceUrl: def.sourceUrl,
                    isBuiltin: def.isBuiltin,
                    dataStrategy: def.dataStrategy,
                    ...(def.isInstalled !== undefined ? { isInstalled: def.isInstalled } : {}),`,
  );
} else {
  console.log('seed builtin update fields: already patched');
}

replaceOnce(
  'seed Google Calendar fields',
  `dataStrategy: def.dataStrategy,
                    ...(def.isInstalled !== undefined ? { isInstalled: def.isInstalled } : {}),`,
  `dataStrategy: def.dataStrategy,
                    oauthProvider: def.oauthProvider,
                    oauthScopes: def.oauthScopes,
                    markupHalfHorizontal: def.markupHalfHorizontal,
                    markupHalfVertical: def.markupHalfVertical,
                    markupQuadrant: def.markupQuadrant,
                    ...(def.isInstalled !== undefined ? { isInstalled: def.isInstalled } : {}),`,
);

replaceOnce(
  'least privilege Google Calendar OAuth scope',
  `scopes: 'https://www.googleapis.com/auth/calendar.readonly',`,
  `scopes: 'https://www.googleapis.com/auth/calendar.events.readonly',`,
);

replaceOnce(
  'render plugin widgets from instances',
  `async renderPluginWidget(width, height, config) {
        const pluginId = config.pluginId;
        if (!pluginId) {
            return this.renderPlaceholderWidget(width, height, 'No plugin selected');
        }
        try {
            const pluginRenderer = this.getPluginRenderer();
            if (!pluginRenderer) {
                return this.renderPlaceholderWidget(width, height, 'Plugin system unavailable');
            }
            const plugin = await this.prisma.plugin.findUnique({ where: { id: pluginId } });
            if (!plugin) {
                return this.renderPlaceholderWidget(width, height, 'Plugin not found');
            }
            const layout = this.inferPluginLayout(width, height, config.layout);
            const markup = pluginRenderer.selectMarkup(plugin, layout);
            if (!markup) {
                return this.renderPlaceholderWidget(width, height, 'No template');
            }
            const settings = config;
            return pluginRenderer.renderToPng(markup, {}, settings, width, height, 'preview');
        }
        catch (error) {
            this.logger.error(\`Failed to render plugin widget \${pluginId}:\`, error);
            return this.renderPlaceholderWidget(width, height, 'Plugin Error');
        }
    }`,
  `async renderPluginWidget(width, height, config) {
        const pluginId = config.pluginId;
        if (!pluginId) {
            return this.renderPlaceholderWidget(width, height, 'No plugin selected');
        }
        try {
            const pluginRenderer = this.getPluginRenderer();
            if (!pluginRenderer) {
                return this.renderPlaceholderWidget(width, height, 'Plugin system unavailable');
            }
            const pluginsService = this.getPluginsService();
            let plugin = await this.prisma.plugin.findUnique({ where: { id: pluginId } });
            if (!plugin) {
                return this.renderPlaceholderWidget(width, height, 'Plugin not found');
            }
            let settings = config;
            let locals = {};
            const pluginInstanceId = Number(config.pluginInstanceId) || 0;
            if (pluginInstanceId && pluginsService) {
                const instance = await pluginsService.findInstanceById(pluginInstanceId);
                plugin = instance.plugin;
                settings = { ...pluginsService.getDecryptedSettings(instance), ...config };
                locals = await pluginsService.fetchData(pluginInstanceId);
            }
            else if (pluginsService) {
                const missingSettings = (plugin.settingsSchema || [])
                    .filter((field) => (field.encrypted || field.required) && !settings[field.key]);
                if (missingSettings.length > 0) {
                    return this.renderPlaceholderWidget(width, height, 'Configure plugin');
                }
                locals = await pluginsService.executePlugin(plugin, settings);
            }
            const layout = this.inferPluginLayout(width, height, config.layout);
            const markup = pluginRenderer.selectMarkup(plugin, layout);
            if (!markup) {
                return this.renderPlaceholderWidget(width, height, 'No template');
            }
            return pluginRenderer.renderToPng(markup, locals, settings, width, height, 'preview');
        }
        catch (error) {
            this.logger.error(\`Failed to render plugin widget \${pluginId}:\`, error);
            return this.renderPlaceholderWidget(width, height, 'Plugin Error');
        }
    }`,
);

replaceOnce(
  'generate plugin widget html from instances',
  `async generatePluginWidgetContent(config, width, height) {
        const pluginId = config.pluginId;
        if (!pluginId) {
            return '<div style="color:#999;font-size:12px;display:flex;align-items:center;justify-content:center;height:100%">Select a plugin</div>';
        }
        try {
            const plugin = await this.prisma.plugin.findUnique({ where: { id: pluginId } });
            if (!plugin) {
                return '<div style="color:#999;font-size:12px">Plugin not found</div>';
            }
            const pluginRenderer = this.getPluginRenderer();
            if (!pluginRenderer) {
                return \`<div style="font-size:12px;padding:8px"><strong>\${plugin.name}</strong></div>\`;
            }
            const layout = this.inferPluginLayout(width, height, config.layout);
            const markup = pluginRenderer.selectMarkup(plugin, layout);
            if (!markup) {
                return \`<div style="font-size:12px;padding:8px"><strong>\${plugin.name}</strong><br/><span style="color:#999">No template</span></div>\`;
            }
            const settings = config;
            const html = await pluginRenderer.renderToHtml(markup, {}, settings);
            return html;
        }
        catch (error) {
            return '<div style="color:#999;font-size:12px">Render error</div>';
        }
    }`,
  `async generatePluginWidgetContent(config, width, height) {
        const pluginId = config.pluginId;
        if (!pluginId) {
            return '<div style="color:#999;font-size:12px;display:flex;align-items:center;justify-content:center;height:100%">Select a plugin</div>';
        }
        try {
            const pluginRenderer = this.getPluginRenderer();
            const pluginsService = this.getPluginsService();
            let plugin = await this.prisma.plugin.findUnique({ where: { id: pluginId } });
            if (!plugin) {
                return '<div style="color:#999;font-size:12px">Plugin not found</div>';
            }
            if (!pluginRenderer) {
                return \`<div style="font-size:12px;padding:8px"><strong>\${plugin.name}</strong></div>\`;
            }
            let settings = config;
            let locals = {};
            const pluginInstanceId = Number(config.pluginInstanceId) || 0;
            if (pluginInstanceId && pluginsService) {
                const instance = await pluginsService.findInstanceById(pluginInstanceId);
                plugin = instance.plugin;
                settings = { ...pluginsService.getDecryptedSettings(instance), ...config };
                locals = await pluginsService.fetchData(pluginInstanceId);
            }
            else if (pluginsService) {
                const missingSettings = (plugin.settingsSchema || [])
                    .filter((field) => (field.encrypted || field.required) && !settings[field.key]);
                if (missingSettings.length > 0) {
                    return '<div style="color:#999;font-size:12px;display:flex;align-items:center;justify-content:center;height:100%">Configure plugin</div>';
                }
                locals = await pluginsService.executePlugin(plugin, settings);
            }
            const layout = this.inferPluginLayout(width, height, config.layout);
            const markup = pluginRenderer.selectMarkup(plugin, layout);
            if (!markup) {
                return \`<div style="font-size:12px;padding:8px"><strong>\${plugin.name}</strong><br/><span style="color:#999">No template</span></div>\`;
            }
            return pluginRenderer.renderToHtml(markup, locals, settings);
        }
        catch (error) {
            return '<div style="color:#999;font-size:12px">Render error</div>';
        }
    }`,
);

replaceOnce(
  'lazy plugin service for screen renderer',
  `getPluginRenderer() {
        try {
            const { PluginRendererService } = __webpack_require__(63);
            if (!this._pluginRenderer) {
                this._pluginRenderer = new PluginRendererService(this);
            }
            return this._pluginRenderer;
        }
        catch {
            return null;
        }
    }`,
  `getPluginRenderer() {
        try {
            const { PluginRendererService } = __webpack_require__(63);
            if (!this._pluginRenderer) {
                this._pluginRenderer = new PluginRendererService(this);
            }
            return this._pluginRenderer;
        }
        catch {
            return null;
        }
    }
    getPluginsService() {
        try {
            const { PluginsService } = __webpack_require__(84);
            const { EncryptionService } = __webpack_require__(85);
            const { OAuthService } = __webpack_require__(86);
            if (!this._pluginsService) {
                const encryption = new EncryptionService(this.configService);
                const oauthService = new OAuthService(this.configService, this.prisma, encryption);
                this._pluginsService = new PluginsService(this.prisma, this.getPluginRenderer(), encryption, oauthService);
            }
            return this._pluginsService;
        }
        catch (error) {
            this.logger.warn(\`Plugin service unavailable: \${error.message || error}\`);
            return null;
        }
    }`,
);

replaceOnce(
  'create screen plugin virtual templates',
  `let customWidgetBaseTemplateId = null;
        if (widgets?.some(w => w.templateId >= widget_constants_1.CUSTOM_WIDGET_TEMPLATE_OFFSET)) {
            customWidgetBaseTemplateId = await this.widgetTemplatesService.getCustomWidgetBaseTemplateId();
        }
        const mappedWidgets = widgets?.map((widget, index) => {
            const isCustomWidget = widget.templateId >= widget_constants_1.CUSTOM_WIDGET_TEMPLATE_OFFSET;
            const actualTemplateId = isCustomWidget ? customWidgetBaseTemplateId : widget.templateId;
            const config = isCustomWidget
                ? {
                    ...(widget.config ?? {}),
                    customWidgetId: widget.templateId - widget_constants_1.CUSTOM_WIDGET_TEMPLATE_OFFSET,
                }
                : (widget.config ?? {});`,
  `let customWidgetBaseTemplateId = null;
        let pluginBaseTemplateId = null;
        if (widgets?.some(w => w.templateId >= widget_constants_1.CUSTOM_WIDGET_TEMPLATE_OFFSET && w.templateId < widget_constants_1.PLUGIN_TEMPLATE_OFFSET)) {
            customWidgetBaseTemplateId = await this.widgetTemplatesService.getCustomWidgetBaseTemplateId();
        }
        if (widgets?.some(w => w.templateId >= widget_constants_1.PLUGIN_TEMPLATE_OFFSET)) {
            pluginBaseTemplateId = (await this.widgetTemplatesService.getByName('plugin')).id;
        }
        const mappedWidgets = widgets?.map((widget, index) => {
            const isPluginWidget = widget.templateId >= widget_constants_1.PLUGIN_TEMPLATE_OFFSET;
            const isCustomWidget = widget.templateId >= widget_constants_1.CUSTOM_WIDGET_TEMPLATE_OFFSET && widget.templateId < widget_constants_1.PLUGIN_TEMPLATE_OFFSET;
            const actualTemplateId = isPluginWidget ? pluginBaseTemplateId : isCustomWidget ? customWidgetBaseTemplateId : widget.templateId;
            const config = isPluginWidget
                ? {
                    ...(widget.config ?? {}),
                    type: 'plugin',
                    pluginId: widget.config?.pluginId ?? (widget.templateId - widget_constants_1.PLUGIN_TEMPLATE_OFFSET),
                }
                : isCustomWidget
                    ? {
                        ...(widget.config ?? {}),
                        customWidgetId: widget.templateId - widget_constants_1.CUSTOM_WIDGET_TEMPLATE_OFFSET,
                    }
                    : (widget.config ?? {});`,
);

replaceOnce(
  'update screen plugin virtual templates',
  `let customWidgetBaseTemplateId = null;
        if (widgets?.some(w => w.templateId >= widget_constants_1.CUSTOM_WIDGET_TEMPLATE_OFFSET)) {
            customWidgetBaseTemplateId = await this.widgetTemplatesService.getCustomWidgetBaseTemplateId();
        }
        const updatedDesign = await this.prisma.$transaction(async (tx) => {`,
  `let customWidgetBaseTemplateId = null;
        let pluginBaseTemplateId = null;
        if (widgets?.some(w => w.templateId >= widget_constants_1.CUSTOM_WIDGET_TEMPLATE_OFFSET && w.templateId < widget_constants_1.PLUGIN_TEMPLATE_OFFSET)) {
            customWidgetBaseTemplateId = await this.widgetTemplatesService.getCustomWidgetBaseTemplateId();
        }
        if (widgets?.some(w => w.templateId >= widget_constants_1.PLUGIN_TEMPLATE_OFFSET)) {
            pluginBaseTemplateId = (await this.widgetTemplatesService.getByName('plugin')).id;
        }
        const updatedDesign = await this.prisma.$transaction(async (tx) => {`,
);

replaceOnce(
  'update screen plugin widget mapping',
  `const mappedWidgets = widgets.map((widget, index) => {
                        const isCustomWidget = widget.templateId >= widget_constants_1.CUSTOM_WIDGET_TEMPLATE_OFFSET;
                        const actualTemplateId = isCustomWidget ? customWidgetBaseTemplateId : widget.templateId;
                        const config = isCustomWidget
                            ? {
                                ...(widget.config ?? {}),
                                customWidgetId: widget.templateId - widget_constants_1.CUSTOM_WIDGET_TEMPLATE_OFFSET,
                            }
                            : (widget.config ?? {});`,
  `const mappedWidgets = widgets.map((widget, index) => {
                        const isPluginWidget = widget.templateId >= widget_constants_1.PLUGIN_TEMPLATE_OFFSET;
                        const isCustomWidget = widget.templateId >= widget_constants_1.CUSTOM_WIDGET_TEMPLATE_OFFSET && widget.templateId < widget_constants_1.PLUGIN_TEMPLATE_OFFSET;
                        const actualTemplateId = isPluginWidget ? pluginBaseTemplateId : isCustomWidget ? customWidgetBaseTemplateId : widget.templateId;
                        const config = isPluginWidget
                            ? {
                                ...(widget.config ?? {}),
                                type: 'plugin',
                                pluginId: widget.config?.pluginId ?? (widget.templateId - widget_constants_1.PLUGIN_TEMPLATE_OFFSET),
                            }
                            : isCustomWidget
                                ? {
                                    ...(widget.config ?? {}),
                                    customWidgetId: widget.templateId - widget_constants_1.CUSTOM_WIDGET_TEMPLATE_OFFSET,
                                }
                                : (widget.config ?? {});`,
);

replaceOnce(
  'add widget plugin virtual templates',
  `const template = await this.prisma.widgetTemplate.findUnique({
            where: { id: dto.templateId },
        });
        if (!template) {
            throw new common_1.BadRequestException('Widget template not found');
        }
        const width = dto.width ?? 200;
        const height = dto.height ?? 100;
        if (width < template.minWidth || height < template.minHeight) {
            throw new common_1.BadRequestException(\`Widget dimensions must be at least \${template.minWidth}x\${template.minHeight}\`);
        }
        const config = {
            ...template.defaultConfig,
            ...(dto.config ?? {}),
        };
        const widget = await this.prisma.screenWidget.create({
            data: {
                screenDesignId,
                templateId: dto.templateId,`,
  `let templateId = dto.templateId;
        let widgetConfig = dto.config ?? {};
        if (templateId >= widget_constants_1.PLUGIN_TEMPLATE_OFFSET) {
            const pluginId = widgetConfig.pluginId ?? (templateId - widget_constants_1.PLUGIN_TEMPLATE_OFFSET);
            templateId = (await this.widgetTemplatesService.getByName('plugin')).id;
            widgetConfig = {
                ...widgetConfig,
                type: 'plugin',
                pluginId,
            };
        }
        const template = await this.prisma.widgetTemplate.findUnique({
            where: { id: templateId },
        });
        if (!template) {
            throw new common_1.BadRequestException('Widget template not found');
        }
        const width = dto.width ?? 200;
        const height = dto.height ?? 100;
        if (width < template.minWidth || height < template.minHeight) {
            throw new common_1.BadRequestException(\`Widget dimensions must be at least \${template.minWidth}x\${template.minHeight}\`);
        }
        const config = {
            ...template.defaultConfig,
            ...widgetConfig,
        };
        const widget = await this.prisma.screenWidget.create({
            data: {
                screenDesignId,
                templateId,`,
);

replaceOnce(
  'restore plugin virtual template ids',
  `const config = widget.config;
                const customWidgetId = config?.customWidgetId;
                if (customWidgetId !== undefined && customWidgetId !== null) {
                    return {
                        ...widget,
                        templateId: widget_constants_1.CUSTOM_WIDGET_TEMPLATE_OFFSET + customWidgetId,
                    };
                }
                return widget;`,
  `const config = widget.config;
                const pluginId = config?.pluginId;
                if (widget.template?.name === 'plugin' && pluginId !== undefined && pluginId !== null) {
                    return {
                        ...widget,
                        templateId: widget_constants_1.PLUGIN_TEMPLATE_OFFSET + Number(pluginId),
                    };
                }
                const customWidgetId = config?.customWidgetId;
                if (customWidgetId !== undefined && customWidgetId !== null) {
                    return {
                        ...widget,
                        templateId: widget_constants_1.CUSTOM_WIDGET_TEMPLATE_OFFSET + customWidgetId,
                    };
                }
                return widget;`,
);

replaceOnce(
  'second heart minute cache',
  `if (age < plugin.refreshInterval) {`,
  `if (age < plugin.refreshInterval && (plugin.slug !== 'a_second_heart' || Math.floor(Date.now() / 60000) === Math.floor(instance.lastFetchedAt.getTime() / 60000))) {`,
);

fs.writeFileSync(mainPath, source);
console.log(`Patched ${mainPath}`);
