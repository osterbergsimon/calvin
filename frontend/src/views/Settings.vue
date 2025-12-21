<template>
  <div class="settings-page">
    <div class="settings-header">
      <h1>Settings & Configuration</h1>
      <div class="header-actions">
        <div class="system-menu">
          <button
            class="btn-system-menu"
            @click="showSystemMenu = !showSystemMenu"
          >
            ⚙️ System
            <span class="menu-arrow">{{ showSystemMenu ? "▲" : "▼" }}</span>
          </button>
          <div v-if="showSystemMenu" class="system-menu-dropdown">
            <button
              class="menu-item"
              @click="restartBackend"
              title="Restart the backend server"
            >
              🔄 Restart Backend
            </button>
            <button
              class="menu-item"
              @click="restartFrontend"
              title="Restart the frontend server"
            >
              🔄 Restart Frontend
            </button>
            <button
              class="menu-item"
              @click="reloadUI"
              title="Reload the frontend page"
            >
              🔄 Reload Page
            </button>
          </div>
        </div>
        <button class="btn-back" @click="goBack">← Back to Dashboard</button>
      </div>
    </div>

    <div class="settings-layout">
      <!-- Sidebar Navigation -->
      <aside class="settings-sidebar">
        <nav class="category-nav">
          <button
            v-for="category in categories"
            :key="category.id"
            class="category-btn"
            :class="{ active: activeCategory === category.id }"
            @click="activeCategory = category.id"
          >
            <span class="category-icon">{{ category.icon }}</span>
            <span class="category-label">{{ category.label }}</span>
          </button>
        </nav>
      </aside>

      <!-- Main Content -->
      <div class="settings-content">
        <!-- Layout & Display Category -->
        <template v-if="activeCategory === 'layout'">
          <!-- Display Settings -->
          <section
            class="settings-section collapsible"
            :class="{ expanded: expandedSections.display }"
          >
            <div class="section-header" @click="toggleSection('display')">
              <h2>Display Settings</h2>
              <span class="toggle-icon">{{
                expandedSections.display ? "▼" : "▶"
              }}</span>
            </div>
            <div v-show="expandedSections.display" class="section-content">
              <div class="setting-item">
                <label>Screen Orientation</label>
                <select
                  v-model="localConfig.orientation"
                  @change="updateOrientation"
                >
                  <option value="landscape">Landscape</option>
                  <option value="portrait">Portrait</option>
                </select>
              </div>
              <div class="setting-item">
                <label>
                  <input
                    v-model="localConfig.orientationFlipped"
                    type="checkbox"
                    @change="updateOrientationFlipped"
                  />
                  Flip Orientation (180°)
                </label>
                <span class="help-text"
                  >Rotate the display 180 degrees (useful for mounted
                  displays)</span
                >
              </div>
              <div class="setting-item">
                <label>Calendar Split (%)</label>
                <input
                  v-model.number="localConfig.calendarSplit"
                  type="number"
                  min="10"
                  max="90"
                  @change="updateCalendarSplit"
                />
                <span class="help-text"
                  >Calendar width percentage (10-90%)</span
                >
              </div>
              <div class="setting-item">
                <label>Side View Position</label>
                <select
                  v-model="localConfig.sideViewPosition"
                  class="setting-select"
                  @change="updateSideViewPosition"
                >
                  <option
                    v-if="localConfig.orientation === 'landscape'"
                    value="left"
                  >
                    Left
                  </option>
                  <option
                    v-if="localConfig.orientation === 'landscape'"
                    value="right"
                  >
                    Right
                  </option>
                  <option
                    v-if="localConfig.orientation === 'portrait'"
                    value="top"
                  >
                    Top
                  </option>
                  <option
                    v-if="localConfig.orientation === 'portrait'"
                    value="bottom"
                  >
                    Bottom
                  </option>
                </select>
                <span class="help-text">
                  <span v-if="localConfig.orientation === 'landscape'"
                    >Position of side view (left or right of calendar)</span
                  >
                  <span v-else
                    >Position of side view (top or bottom of calendar)</span
                  >
                </span>
              </div>
              <div class="setting-item">
                <div
                  class="collapsible-setting"
                  :class="{ expanded: expandedSections.themeSelection }"
                >
                  <div
                    class="setting-header"
                    @click="toggleSection('themeSelection')"
                    style="
                      cursor: pointer;
                      display: flex;
                      justify-content: space-between;
                      align-items: center;
                    "
                  >
                    <label>Theme</label>
                    <span class="toggle-icon">{{
                      expandedSections.themeSelection ? "▼" : "▶"
                    }}</span>
                  </div>
                  <div
                    v-show="expandedSections.themeSelection"
                    class="setting-content"
                    style="margin-top: 0.5rem"
                  >
                    <div v-if="loadingThemes" class="loading-state">
                      <p>Loading themes...</p>
                    </div>
                    <div v-else class="theme-selection-grid">
                      <div
                        v-for="theme in themesList"
                        :key="theme.id"
                        class="theme-selection-item"
                        :class="{
                          active: localConfig.selectedTheme === theme.id,
                          builtin: theme.is_builtin,
                        }"
                        @click="selectTheme(theme.id)"
                      >
                        <div class="theme-selection-preview">
                          <div
                            v-if="theme.preview_image"
                            class="theme-preview-image"
                            :style="{
                              backgroundImage: theme.preview
                                ? `url(/api/plugins/${theme.id}/preview)`
                                : undefined,
                            }"
                          ></div>
                          <div
                            v-else
                            class="theme-preview-placeholder"
                            :style="getThemePreviewStyle(theme)"
                          >
                            {{ theme.name.charAt(0) }}
                          </div>
                          <span
                            v-if="localConfig.selectedTheme === theme.id"
                            class="theme-selected-badge"
                          >
                            ✓
                          </span>
                        </div>
                        <div class="theme-selection-info">
                          <strong>{{ theme.name }}</strong>
                          <span
                            v-if="theme.is_builtin"
                            class="theme-badge-small"
                            >Built-in</span
                          >
                        </div>
                      </div>
                    </div>
                    <span
                      class="help-text"
                      style="display: block; margin-top: 0.5rem"
                      >Select a theme to customize the appearance</span
                    >
                  </div>
                </div>
              </div>
              <div class="setting-item">
                <label>Theme Mode</label>
                <select
                  v-model="localConfig.themeMode"
                  class="setting-select"
                  @change="updateThemeMode"
                >
                  <option value="light">Light</option>
                  <option value="dark">Dark</option>
                  <option value="auto">Auto (System)</option>
                  <option value="time">Time-based</option>
                </select>
                <span class="help-text"
                  >Controls when dark mode is applied (if theme supports
                  it)</span
                >
              </div>
              <div v-if="localConfig.themeMode === 'time'" class="setting-item">
                <label>Dark Mode Time Range</label>
                <div class="time-range-inputs">
                  <div class="time-input-group">
                    <label>Start (hour):</label>
                    <input
                      v-model.number="localConfig.darkModeStart"
                      type="number"
                      min="0"
                      max="23"
                      class="time-input"
                      @change="updateDarkModeTime"
                    />
                  </div>
                  <div class="time-input-group">
                    <label>End (hour):</label>
                    <input
                      v-model.number="localConfig.darkModeEnd"
                      type="number"
                      min="0"
                      max="23"
                      class="time-input"
                      @change="updateDarkModeTime"
                    />
                  </div>
                </div>
                <span class="help-text"
                  >Dark mode active between these hours (0-23)</span
                >
              </div>
            </div>
          </section>

          <!-- UI Settings -->
          <section
            class="settings-section collapsible"
            :class="{ expanded: expandedSections.ui }"
          >
            <div class="section-header" @click="toggleSection('ui')">
              <h2>UI Settings</h2>
              <span class="toggle-icon">{{
                expandedSections.ui ? "▼" : "▶"
              }}</span>
            </div>
            <div v-show="expandedSections.ui" class="section-content">
              <div class="setting-item">
                <label>
                  <input
                    v-model="localConfig.showUI"
                    type="checkbox"
                    @change="updateShowUI"
                  />
                  Show Headers and UI Controls
                </label>
                <span class="help-text"
                  >Hide headers to maximize content space (kiosk mode)</span
                >
              </div>
              <div class="setting-item">
                <label>
                  <input
                    v-model="localConfig.showModeIndicator"
                    type="checkbox"
                    @change="updateShowModeIndicator"
                  />
                  Show Mode Indicator Icon
                </label>
                <span class="help-text"
                  >Show mode indicator icon when UI is hidden (top-left
                  corner)</span
                >
              </div>
              <div v-if="localConfig.showModeIndicator" class="setting-item">
                <label>Mode Indicator Auto-Hide Timeout (seconds)</label>
                <input
                  v-model.number="localConfig.modeIndicatorTimeout"
                  type="number"
                  min="0"
                  max="60"
                  @change="updateModeIndicatorTimeout"
                />
                <span class="help-text"
                  >Time before indicator auto-hides after mode change (0 = never
                  hide)</span
                >
              </div>
              <div class="setting-item">
                <label>
                  <input
                    v-model="localConfig.clockEnabled"
                    type="checkbox"
                    @change="updateClockSettings"
                  />
                  Enable Clock
                </label>
                <span class="help-text">Show clock on dashboard</span>
              </div>
              <div v-if="localConfig.clockEnabled" class="setting-item">
                <label>Clock Display Mode</label>
                <select
                  v-model="localConfig.clockDisplayMode"
                  @change="updateClockSettings"
                >
                  <option value="always">When UI is Off (Kiosk Mode)</option>
                  <option value="header">Only When Header is Visible</option>
                  <option value="off">Off</option>
                </select>
                <span class="help-text"
                  >When to display the clock on the dashboard. "When UI is Off"
                  shows clock in corner when headers are hidden.</span
                >
              </div>
              <div
                v-if="
                  localConfig.clockEnabled &&
                  localConfig.clockDisplayMode === 'always'
                "
                class="setting-item"
              >
                <label>Clock Position</label>
                <select
                  v-model="localConfig.clockPosition"
                  @change="updateClockSettings"
                >
                  <option value="top-left">Top Left</option>
                  <option value="top-right">Top Right</option>
                  <option value="bottom-left">Bottom Left</option>
                  <option value="bottom-right">Bottom Right</option>
                </select>
                <span class="help-text"
                  >Position of the clock when UI is off</span
                >
              </div>
              <div v-if="localConfig.clockEnabled" class="setting-item">
                <label>Clock Size</label>
                <select
                  v-model="localConfig.clockSize"
                  @change="updateClockSettings"
                >
                  <option value="small">Small</option>
                  <option value="medium">Medium</option>
                  <option value="large">Large</option>
                </select>
                <span class="help-text">Size of the clock display</span>
              </div>
              <div v-if="localConfig.clockEnabled" class="setting-item">
                <label>
                  <input
                    v-model="localConfig.clockShowDate"
                    type="checkbox"
                    @change="updateClockSettings"
                  />
                  Show Date in Clock
                </label>
                <span class="help-text">Display date below the time</span>
              </div>
              <div v-if="localConfig.clockEnabled" class="setting-item">
                <label>
                  <input
                    v-model="localConfig.clockShowSeconds"
                    type="checkbox"
                    @change="updateClockSettings"
                  />
                  Show Seconds in Clock
                </label>
                <span class="help-text"
                  >Display seconds in the time (updates every second)</span
                >
              </div>
            </div>
          </section>
        </template>

        <!-- Content Category -->
        <template v-if="activeCategory === 'content'">
          <!-- Image Settings -->
          <section
            class="settings-section collapsible"
            :class="{ expanded: expandedSections.photos }"
          >
            <div class="section-header" @click="toggleSection('photos')">
              <h2>Image Settings</h2>
              <span class="toggle-icon">{{
                expandedSections.photos ? "▼" : "▶"
              }}</span>
            </div>
            <div v-show="expandedSections.photos" class="section-content">
              <div class="setting-item">
                <label>Photo Rotation Interval (seconds)</label>
                <input
                  v-model.number="localConfig.photoRotationInterval"
                  type="number"
                  min="5"
                  max="3600"
                  @change="updatePhotoRotationInterval"
                />
                <span class="help-text"
                  >How often to switch photos (5-3600 seconds)</span
                >
              </div>
              <div class="setting-item">
                <label>Image Display Mode</label>
                <select
                  v-model="localConfig.imageDisplayMode"
                  class="setting-select"
                  @change="updateImageDisplayMode"
                >
                  <option value="smart">Smart (Auto-detect best fit)</option>
                  <option value="fit">Fit (Show entire image)</option>
                  <option value="fill">Fill (Fill container, may crop)</option>
                  <option value="crop">Crop (Center crop to fill)</option>
                  <option value="center">
                    Center (Center image, no scaling)
                  </option>
                </select>
                <span class="help-text"
                  >How images are displayed. Smart mode automatically chooses
                  the best fit based on image and screen dimensions.</span
                >
              </div>
              <div class="setting-item">
                <label>
                  <input
                    v-model="localConfig.randomizeImages"
                    type="checkbox"
                    @change="updateRandomizeImages"
                  />
                  Randomize Image Order
                </label>
                <span class="help-text"
                  >When enabled, images from all plugins (local, Unsplash, etc.)
                  will be displayed in random order. The order is randomized
                  each time images are loaded.</span
                >
              </div>
              <div class="setting-item">
                <p class="help-text">
                  <strong>Note:</strong> Image upload and management have been
                  moved to the Local Images plugin settings. Enable the Local
                  Images plugin and expand its settings to upload and manage
                  images.
                </p>
              </div>
            </div>
          </section>

          <!-- Photo Frame Mode Settings -->
          <section
            class="settings-section collapsible"
            :class="{ expanded: expandedSections.photoFrame }"
          >
            <div class="section-header" @click="toggleSection('photoFrame')">
              <h2>Photo Frame Mode</h2>
              <span class="toggle-icon">{{
                expandedSections.photoFrame ? "▼" : "▶"
              }}</span>
            </div>
            <div v-show="expandedSections.photoFrame" class="section-content">
              <div class="setting-item">
                <label>
                  <input
                    v-model="localConfig.photoFrameEnabled"
                    type="checkbox"
                    @change="updatePhotoFrameEnabled"
                  />
                  Enable Photo Frame Mode
                </label>
                <span class="help-text"
                  >Automatically show photos full-screen after inactivity</span
                >
              </div>
              <div v-if="localConfig.photoFrameEnabled" class="setting-item">
                <label>Inactivity Timeout (seconds)</label>
                <input
                  v-model.number="localConfig.photoFrameTimeout"
                  type="number"
                  min="60"
                  max="3600"
                  @change="updatePhotoFrameTimeout"
                />
                <span class="help-text"
                  >Time before switching to photo frame mode (60-3600
                  seconds)</span
                >
              </div>
            </div>
          </section>
        </template>

        <!-- System Category -->
        <template v-if="activeCategory === 'system'">
          <!-- Keyboard Settings -->
          <section
            class="settings-section collapsible"
            :class="{ expanded: expandedSections.keyboard }"
          >
            <div class="section-header" @click="toggleSection('keyboard')">
              <h2>Keyboard Settings</h2>
              <span class="toggle-icon">{{
                expandedSections.keyboard ? "▼" : "▶"
              }}</span>
            </div>
            <div v-show="expandedSections.keyboard" class="section-content">
              <div class="setting-item">
                <label>Keyboard Type</label>
                <select
                  v-model="localConfig.keyboardType"
                  @change="updateKeyboardType"
                >
                  <option value="7-button">7-Button Keyboard</option>
                  <option value="standard">Standard Keyboard</option>
                </select>
              </div>

              <div class="setting-item">
                <label>
                  <input
                    type="checkbox"
                    v-model="localConfig.keyboardFeedbackEnabled"
                    @change="saveConfig"
                  />
                  Enable Keyboard Feedback
                </label>
                <span class="help-text"
                  >Show visual feedback when keys are pressed (helpful for
                  7-button keyboards)</span
                >
              </div>

              <div
                class="setting-item"
                v-if="localConfig.keyboardFeedbackEnabled"
              >
                <label>Feedback Mode</label>
                <select
                  v-model="localConfig.keyboardFeedbackMode"
                  @change="saveConfig"
                >
                  <option value="normal">Normal (Center)</option>
                  <option value="small">Small (Bottom-Right)</option>
                </select>
                <span class="help-text"
                  >Small mode is less obtrusive and appears in the corner</span
                >
              </div>

              <div class="keyboard-mappings">
                <h3>Keyboard Mappings</h3>
                <div class="mappings-list">
                  <div
                    v-for="(action, key) in currentMappings"
                    :key="key"
                    class="mapping-item"
                  >
                    <div class="mapping-key">
                      <strong>{{ formatKeyName(key) }}</strong>
                    </div>
                    <select
                      v-model="currentMappings[key]"
                      class="mapping-action"
                      @change="updateMapping(key, $event.target.value)"
                    >
                      <option
                        v-for="availableAction in availableActions"
                        :key="availableAction.value"
                        :value="availableAction.value"
                      >
                        {{ availableAction.label }}
                      </option>
                    </select>
                    <button
                      class="btn-clear"
                      title="Clear mapping"
                      @click="clearMapping(key)"
                    >
                      ×
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </section>
        </template>

        <!-- Content Category (continued) -->
        <template v-if="activeCategory === 'content'">
          <!-- Calendar Settings -->
          <section
            class="settings-section collapsible"
            :class="{ expanded: expandedSections.calendar }"
          >
            <div class="section-header" @click="toggleSection('calendar')">
              <h2>Calendar Settings</h2>
              <span class="toggle-icon">{{
                expandedSections.calendar ? "▼" : "▶"
              }}</span>
            </div>
            <div v-show="expandedSections.calendar" class="section-content">
              <div class="setting-item">
                <label>Calendar View Mode</label>
                <select
                  v-model="localConfig.calendarViewMode"
                  class="setting-select"
                  @change="updateCalendarViewMode"
                >
                  <option value="month">Month View</option>
                  <option value="rolling">Rolling Weeks View</option>
                </select>
                <span class="help-text"
                  >Display full month or rolling weeks</span
                >
              </div>
              <div class="setting-item">
                <label>Time Format</label>
                <select
                  v-model="localConfig.timeFormat"
                  class="setting-select"
                  @change="updateTimeFormat"
                >
                  <option value="24h">24-hour (14:30)</option>
                  <option value="12h">12-hour (2:30 PM)</option>
                </select>
                <span class="help-text">Time display format for events</span>
              </div>
              <div class="setting-item">
                <label>Week Starting Day</label>
                <select
                  v-model.number="localConfig.weekStartDay"
                  class="setting-select"
                  @change="updateWeekStartDay"
                >
                  <option :value="0">Sunday</option>
                  <option :value="1">Monday</option>
                  <option :value="2">Tuesday</option>
                  <option :value="3">Wednesday</option>
                  <option :value="4">Thursday</option>
                  <option :value="5">Friday</option>
                  <option :value="6">Saturday</option>
                </select>
                <span class="help-text"
                  >First day of the week in the calendar</span
                >
              </div>
              <div class="setting-item">
                <label>
                  <input
                    v-model="localConfig.showWeekNumbers"
                    type="checkbox"
                    @change="updateShowWeekNumbers"
                  />
                  Show Week Numbers
                </label>
                <span class="help-text"
                  >Display ISO 8601 week numbers in the calendar</span
                >
              </div>
              <div class="setting-item">
                <label>Weekend Days</label>
                <div class="weekend-days-selector">
                  <label
                    v-for="dayOption in [
                      { value: 0, label: 'Sun' },
                      { value: 1, label: 'Mon' },
                      { value: 2, label: 'Tue' },
                      { value: 3, label: 'Wed' },
                      { value: 4, label: 'Thu' },
                      { value: 5, label: 'Fri' },
                      { value: 6, label: 'Sat' },
                    ]"
                    :key="dayOption.value"
                    class="weekend-day-checkbox"
                  >
                    <input
                      type="checkbox"
                      :value="dayOption.value"
                      :checked="
                        localConfig.weekendDays?.includes(dayOption.value) ||
                        false
                      "
                      @change="updateWeekendDays(dayOption.value, $event)"
                    />
                    {{ dayOption.label }}
                  </label>
                </div>
                <span class="help-text"
                  >Select which days should be styled as weekends</span
                >
              </div>
              <div class="setting-item">
                <label>
                  <input
                    v-model="localConfig.showRedDays"
                    type="checkbox"
                    @change="updateShowRedDays"
                  />
                  Show Red Days (Holidays)
                </label>
                <span class="help-text"
                  >Highlight holidays in red (requires backend support)</span
                >
              </div>
              <div class="setting-item">
                <label>Max Visible Events</label>
                <input
                  v-model.number="localConfig.maxVisibleEvents"
                  type="number"
                  min="1"
                  max="20"
                  @change="updateMaxVisibleEvents"
                />
                <span class="help-text"
                  >Maximum events shown per day before "+X more" indicator
                  (1-20)</span
                >
              </div>
              <div class="setting-item">
                <label>Calendar Sources</label>
                <!-- Add Calendar Source Form -->
                <div class="add-calendar-form">
                  <h3>Add Calendar Source</h3>
                  <div class="form-group">
                    <label>Calendar Type</label>
                    <select
                      v-model="newCalendarSource.type"
                      class="form-select"
                    >
                      <option
                        v-for="type in calendarPluginTypes"
                        :key="type.id"
                        :value="type.id"
                      >
                        {{ type.name }}
                      </option>
                    </select>
                  </div>
                  <div class="form-group">
                    <label>Calendar Name</label>
                    <input
                      v-model="newCalendarSource.name"
                      type="text"
                      placeholder="My Calendar"
                      class="form-input"
                    />
                  </div>
                  <div class="form-group">
                    <label>Calendar URL</label>
                    <input
                      v-model="newCalendarSource.ical_url"
                      type="text"
                      :placeholder="
                        getCalendarTypePlaceholder(newCalendarSource.type)
                      "
                      class="form-input"
                    />
                    <span class="help-text">
                      {{ getCalendarTypeHelpText(newCalendarSource.type) }}
                    </span>
                  </div>
                  <button
                    class="btn-add"
                    :disabled="!canAddCalendar"
                    @click="addCalendarSource"
                  >
                    Add Calendar
                  </button>
                </div>
                <!-- Existing Calendar Sources -->
                <div class="calendar-sources-list">
                  <div
                    v-for="source in calendarSources"
                    :key="source.id"
                    class="source-item"
                  >
                    <div class="source-info">
                      <strong>{{ source.name }}</strong>
                      <span class="source-type">{{ source.type }}</span>
                      <span
                        v-if="source.running !== undefined"
                        class="running-indicator"
                        :class="{
                          running: source.running,
                          stopped: !source.running,
                        }"
                        :title="source.running ? 'Running' : 'Stopped'"
                      >
                        {{ source.running ? "●" : "○" }}
                      </span>
                    </div>
                    <div class="source-settings">
                      <div class="source-setting">
                        <label>Color:</label>
                        <input
                          type="color"
                          :value="source.color || '#2196f3'"
                          class="color-input"
                          @change="
                            updateSourceColor(source.id, $event.target.value)
                          "
                        />
                      </div>
                      <div class="source-setting">
                        <label>
                          <input
                            type="checkbox"
                            :checked="source.show_time !== false"
                            @change="
                              updateSourceShowTime(
                                source.id,
                                $event.target.checked,
                              )
                            "
                          />
                          Show Event Times
                        </label>
                      </div>
                    </div>
                    <div class="source-actions">
                      <label class="toggle-switch">
                        <input
                          type="checkbox"
                          :checked="source.enabled"
                          @change="
                            toggleSource(source.id, $event.target.checked)
                          "
                        />
                        <span class="slider" />
                      </label>
                      <button
                        v-if="source.enabled && source.running !== undefined"
                        class="btn-secondary"
                        :class="{ 'btn-stop': source.running }"
                        :title="source.running ? 'Stop plugin' : 'Start plugin'"
                        @click="
                          source.running
                            ? stopPluginInstance(source.id)
                            : startPluginInstance(source.id)
                        "
                        :disabled="!source.enabled"
                      >
                        {{ source.running ? "Stop" : "Start" }}
                      </button>
                      <button
                        class="btn-remove"
                        title="Remove calendar"
                        @click="removeSource(source.id)"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <!-- Service Ordering -->
          <section
            class="settings-section collapsible"
            :class="{ expanded: expandedSections.serviceOrdering }"
          >
            <div
              class="section-header"
              @click="toggleSection('serviceOrdering')"
            >
              <h2>Service Ordering</h2>
              <span class="toggle-icon">{{
                expandedSections.serviceOrdering ? "▼" : "▶"
              }}</span>
            </div>
            <div
              v-show="expandedSections.serviceOrdering"
              class="section-content"
            >
              <div class="setting-item">
                <p class="help-text">
                  Configure the display order of service plugins. Lower numbers
                  appear first in the service rotation. Drag to reorder or use
                  the number inputs.
                </p>
              </div>
              <div class="service-ordering-list">
                <div
                  v-for="(plugin, index) in sortedServicePlugins"
                  :key="plugin.id"
                  class="service-plugin-order-item"
                >
                  <div class="service-plugin-order-handle">
                    <span class="order-number">{{ index + 1 }}</span>
                    <span class="drag-handle">⋮⋮</span>
                  </div>
                  <div class="service-plugin-info">
                    <strong>{{ plugin.name }}</strong>
                    <span
                      v-if="
                        pluginInstances[plugin.id] &&
                        pluginInstances[plugin.id].length > 0
                      "
                      class="instance-count-badge"
                    >
                      {{ pluginInstances[plugin.id].length }}
                      {{
                        pluginInstances[plugin.id].length === 1
                          ? "instance"
                          : "instances"
                      }}
                    </span>
                  </div>
                  <div class="service-plugin-order-control">
                    <label>Order:</label>
                    <input
                      v-model.number="pluginDisplayOrders[plugin.id]"
                      type="number"
                      class="order-input"
                      min="0"
                      @change="updateServicePluginOrder(plugin.id)"
                    />
                  </div>
                </div>
              </div>
            </div>
          </section>

          <!-- Plugins Settings -->
          <section
            class="settings-section collapsible"
            :class="{ expanded: expandedSections.plugins }"
          >
            <div class="section-header" @click="toggleSection('plugins')">
              <h2>Plugins</h2>
              <span class="toggle-icon">{{
                expandedSections.plugins ? "▼" : "▶"
              }}</span>
            </div>
            <div v-show="expandedSections.plugins" class="section-content">
              <div class="setting-item">
                <label>Plugin Management</label>
                <p class="help-text">
                  Enable or disable plugin types. Disabled plugins won't appear
                  in their respective sections.
                </p>
              </div>

              <!-- Install New Plugin Section -->
              <div class="setting-item plugin-install-compact">
                <label>Install New Plugin</label>
                <div class="plugin-install-tabs">
                  <button
                    class="install-tab"
                    :class="{ active: installMethod === 'zip' }"
                    @click="installMethod = 'zip'"
                  >
                    📦 Zip File
                  </button>
                  <button
                    class="install-tab"
                    :class="{ active: installMethod === 'github' }"
                    @click="installMethod = 'github'"
                  >
                    🐙 GitHub
                  </button>
                </div>

                <!-- Zip File Upload -->
                <div
                  v-show="installMethod === 'zip'"
                  class="plugin-install-content"
                >
                  <input
                    ref="pluginZipInput"
                    type="file"
                    accept=".zip"
                    @change="handlePluginZipSelect"
                    style="display: none"
                  />
                  <div class="install-compact-row">
                    <button
                      type="button"
                      class="btn-upload"
                      :disabled="installingPlugin"
                      @click="$refs.pluginZipInput?.click()"
                    >
                      {{
                        installingPlugin
                          ? "Installing..."
                          : "📦 Choose Zip File"
                      }}
                    </button>
                    <span
                      v-if="selectedPluginZip"
                      class="selected-file-compact"
                    >
                      {{ selectedPluginZip.name }}
                    </span>
                  </div>
                </div>

                <!-- GitHub Repository -->
                <div
                  v-show="installMethod === 'github'"
                  class="plugin-install-content"
                >
                  <p class="help-text-compact">
                    Enter a GitHub repository URL and click "List Plugins" to
                    see available plugins and themes.
                  </p>
                  <div class="install-compact-row">
                    <input
                      v-model="githubRepoUrl"
                      type="text"
                      placeholder="https://github.com/user/repo"
                      class="github-input-compact"
                      :disabled="enumeratingPlugins || installingPlugin"
                    />
                    <input
                      v-model="githubBranch"
                      type="text"
                      placeholder="main"
                      class="github-branch-compact"
                      :disabled="enumeratingPlugins || installingPlugin"
                    />
                    <button
                      type="button"
                      class="btn-browse"
                      :disabled="
                        !githubRepoUrl || enumeratingPlugins || installingPlugin
                      "
                      @click="enumeratePluginsFromGitHub"
                    >
                      {{
                        enumeratingPlugins ? "Loading..." : "🔍 List Plugins"
                      }}
                    </button>
                  </div>

                  <!-- Branch Switch Notice -->
                  <div
                    v-if="pluginBranchSwitched && availablePlugins.length > 0"
                    class="branch-switch-notice-compact"
                  >
                    ℹ️ Using branch: <strong>{{ pluginActualBranch }}</strong>
                  </div>

                  <!-- Available Plugins List -->
                  <div
                    v-if="availablePlugins.length > 0"
                    class="available-plugins-compact"
                  >
                    <div
                      v-for="plugin in availablePlugins"
                      :key="plugin.id"
                      class="plugin-item-inline"
                    >
                      <div class="plugin-info-inline">
                        <strong>{{ plugin.name || plugin.id }}</strong>
                        <span
                          class="plugin-type-badge-small"
                          :class="`type-${plugin.type}`"
                        >
                          {{ plugin.type }}
                        </span>
                        <span
                          v-if="plugin.version"
                          class="plugin-version-small"
                        >
                          v{{ plugin.version }}
                        </span>
                      </div>
                      <button
                        type="button"
                        class="btn-install"
                        :disabled="installingPlugin"
                        @click="installPluginFromGitHub(plugin.path)"
                      >
                        {{ installingPlugin ? "Installing..." : "⬇️ Install" }}
                      </button>
                    </div>
                  </div>
                </div>

                <!-- Installation Status Messages -->
                <div v-if="pluginInstallError" class="error-message">
                  {{ pluginInstallError }}
                </div>
                <div v-if="pluginInstallSuccess" class="success-message">
                  {{ pluginInstallSuccess }}
                  <!-- Branch Switch Notification -->
                  <div v-if="pluginBranchSwitched" class="branch-switch-notice">
                    ℹ️ Branch switched from 'main' to 'master' (main branch not
                    found)
                  </div>
                </div>
                <!-- Restart Required Notice -->
                <div v-if="pluginRequiresRestart" class="restart-notice">
                  <div class="restart-notice-content">
                    <strong>⚠️ Server Restart Required</strong>
                    <p>
                      The plugin has been installed but won't appear in the UI
                      until the backend server is restarted. This is because
                      plugin types are registered in the database during server
                      startup.
                    </p>
                    <div class="restart-actions">
                      <button
                        type="button"
                        class="btn-primary"
                        @click="restartBackend"
                      >
                        🔄 Restart Backend Now
                      </button>
                      <span class="restart-alternative">
                        Or restart manually via SSH:
                        <code>sudo systemctl restart calvin-backend</code>
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              <div v-if="loadingPlugins" class="loading-state">
                <p>Loading plugins...</p>
              </div>
              <div v-else-if="plugins.length === 0" class="empty-state">
                <p>No plugins found</p>
              </div>
              <div v-else class="plugins-container">
                <!-- Plugin Type Tabs -->
                <div class="plugin-tabs">
                  <button
                    v-for="category in sortedPluginCategories"
                    :key="category.type"
                    class="plugin-tab"
                    :class="{ active: activePluginTab === category.type }"
                    @click="activePluginTab = category.type"
                  >
                    {{ category.label }}
                  </button>
                </div>

                <!-- Plugin Cards for Active Tab -->
                <div class="plugins-list">
                  <!-- Info message for Themes tab (only show if no installed themes) -->
                  <div
                    v-if="activePluginTab === 'theme' && !hasInstalledThemes"
                    class="setting-item"
                    style="margin-bottom: 1rem"
                  >
                    <div
                      class="help-text"
                      style="
                        background: var(--bg-secondary);
                        padding: 1rem;
                        border-radius: 6px;
                      "
                    >
                      <p style="margin: 0 0 0.5rem 0">
                        <strong>💡 Installing Themes:</strong> Themes are
                        installed the same way as plugins!
                      </p>
                      <ol style="margin: 0.5rem 0 0 1.5rem; text-align: left">
                        <li>
                          Use the installation section above (Zip File or GitHub
                          tab)
                        </li>
                        <li>
                          Enter a GitHub repository URL and click "List Plugins"
                        </li>
                        <li>
                          Themes will appear in the list alongside plugins
                        </li>
                        <li>Click "Install" next to any theme you want</li>
                      </ol>
                      <p style="margin: 0.5rem 0 0 0">
                        Built-in themes (Light, Dark, Ocean, Forest, Sunset) are
                        always available and can be selected in
                        <strong>UI Settings → Select Theme</strong>.
                      </p>
                    </div>
                  </div>

                  <!-- Empty state for Themes tab (only if truly empty) -->
                  <div
                    v-if="
                      activePluginTab === 'theme' &&
                      (!activePluginCategory?.plugins ||
                        activePluginCategory.plugins.length === 0)
                    "
                    class="empty-state"
                  >
                    <p>
                      No themes found. Install themes using the instructions
                      above.
                    </p>
                  </div>

                  <!-- Plugin/Theme Cards -->
                  <div
                    v-for="plugin in activePluginCategory?.plugins || []"
                    :key="plugin.id"
                    class="plugin-item"
                    :class="{ disabled: !plugin.enabled }"
                  >
                    <div class="plugin-header">
                      <div class="plugin-header-top">
                        <div class="plugin-info">
                          <div class="plugin-title-row">
                            <!-- Aggregated running indicator -->
                            <span
                              v-if="
                                pluginInstances[plugin.id] &&
                                pluginInstances[plugin.id].length > 0
                              "
                              class="running-indicator-aggregate"
                              :class="
                                getAggregatedRunningClass(
                                  pluginInstances[plugin.id],
                                )
                              "
                              :title="
                                getAggregatedRunningTooltip(
                                  pluginInstances[plugin.id],
                                )
                              "
                            >
                              {{
                                getAggregatedRunningSymbol(
                                  pluginInstances[plugin.id],
                                )
                              }}
                            </span>
                            <strong>{{ plugin.name }}</strong>
                            <span
                              class="plugin-type-badge"
                              :class="`type-${plugin.type}`"
                            >
                              {{ plugin.type }}
                            </span>
                          </div>
                          <p class="plugin-description">
                            {{ plugin.description }}
                          </p>
                        </div>
                        <div class="plugin-header-actions">
                          <!-- Settings button -->
                          <button
                            v-if="
                              Object.keys(plugin.config_schema || {}).length >
                                0 ||
                              (pluginInstances[plugin.id] &&
                                pluginInstances[plugin.id].length > 0) ||
                              plugin.type === 'service'
                            "
                            class="btn-icon-only btn-settings-icon"
                            :class="{ active: expandedPlugins[plugin.id] }"
                            @click="togglePluginSettings(plugin.id)"
                            :title="
                              expandedPlugins[plugin.id]
                                ? 'Hide settings'
                                : Object.keys(plugin.config_schema || {})
                                      .length > 0
                                  ? 'Show settings'
                                  : 'Show instances'
                            "
                          >
                            ⚙️
                          </button>
                          <!-- Uninstall button (only for installed plugins/themes) -->
                          <button
                            v-if="plugin._installed"
                            class="btn-remove btn-icon-only"
                            :title="
                              plugin.type === 'theme'
                                ? 'Uninstall this theme'
                                : 'Uninstall this plugin'
                            "
                            @click="uninstallPlugin(plugin.id, plugin.type)"
                          >
                            🗑️
                          </button>
                          <label class="toggle-switch">
                            <input
                              type="checkbox"
                              :checked="plugin.enabled"
                              @change="
                                togglePlugin(plugin.id, $event.target.checked)
                              "
                            />
                            <span class="slider" />
                          </label>
                        </div>
                      </div>
                    </div>
                    <div
                      v-if="plugin.enabled && expandedPlugins[plugin.id]"
                      class="plugin-config"
                    >
                      <!-- Common Settings (for plugin type) -->
                      <!-- Show fields from common_config_schema that are marked as global_only or all fields for non-service plugins -->
                      <div
                        v-if="
                          Object.keys(getGlobalConfigSchema(plugin)).length > 0
                        "
                      >
                        <h4 class="config-section-title">Common Settings</h4>
                        <div
                          v-for="(schema, key) in getGlobalConfigSchema(plugin)"
                          :key="key"
                          class="plugin-setting"
                        >
                          <PluginFieldRenderer
                            :key="key"
                            :plugin-id="plugin.id"
                            :field-key="key"
                            :schema="schema"
                            :value="getFormValue(plugin.id, key, schema)"
                            @update="updateFormValue(plugin.id, key, $event)"
                          />
                        </div>

                        <!-- Plugin Actions (buttons like Save, Test, Fetch) -->
                        <PluginActions
                          v-if="
                            plugin.ui_actions && plugin.ui_actions.length > 0
                          "
                          :plugin-id="plugin.id"
                          :actions="plugin.ui_actions"
                          :saving="savingPlugin === plugin.id"
                          :testing="testingPlugin[plugin.id] || false"
                          :fetching="fetchingPlugin[plugin.id] || false"
                          :save-status="pluginSaveStatus[plugin.id] || null"
                          :test-status="pluginTestStatus[plugin.id] || null"
                          :fetch-status="pluginFetchStatus[plugin.id] || null"
                          :form-data="pluginFormData[plugin.id] || {}"
                          @save="savePluginConfig(plugin.id)"
                          @test="testPluginConnection(plugin.id)"
                          @fetch="fetchPluginNow(plugin.id)"
                          @custom-action="handleCustomAction"
                        />
                      </div>

                      <!-- For service plugins, show a note that settings are per-instance -->
                      <!-- For service plugins without global settings, show a note that settings are per-instance -->
                      <div
                        v-if="
                          plugin.type === 'service' &&
                          Object.keys(getGlobalConfigSchema(plugin)).length ===
                            0 &&
                          Object.keys(plugin.config_schema || {}).length > 0
                        "
                        class="plugin-instance-note"
                      >
                        <p class="help-text">
                          This plugin supports multiple instances. Configure
                          settings for each instance using the "Add Instance"
                          button below. Plugin-global settings are not available
                          for this plugin type.
                        </p>
                      </div>

                      <!-- Plugin Sections (upload, manage images, etc.) -->
                      <PluginSections
                        v-if="
                          plugin.ui_sections &&
                          plugin.ui_sections.length > 0 &&
                          plugin.enabled
                        "
                        :plugin-id="plugin.id"
                        :sections="plugin.ui_sections"
                        :images="
                          imagesList.filter(
                            (img) => img.source === 'local-images',
                          )
                        "
                        :uploading="uploading"
                        :upload-error="uploadError"
                        :upload-success="uploadSuccess"
                        @upload="handleFileSelectFromSection"
                        @delete-image="deleteImage"
                      />

                      <!-- Plugin Instances (not shown for calendar plugins, themes, or single-instance plugins) -->
                      <div
                        v-if="
                          plugin.enabled &&
                          plugin.type !== 'calendar' &&
                          plugin.type !== 'theme' &&
                          plugin.supports_multiple_instances !== false
                        "
                        class="plugin-instances-section"
                      >
                        <div class="instances-header">
                          <h4 class="config-section-title">
                            Instances
                            <span
                              v-if="
                                pluginInstances[plugin.id] &&
                                pluginInstances[plugin.id].length > 0
                              "
                              class="instance-count"
                            >
                              ({{ pluginInstances[plugin.id].length }})
                            </span>
                          </h4>
                          <button
                            class="btn-add-instance"
                            @click="openAddInstanceModal(plugin.id)"
                            title="Add new instance"
                          >
                            + Add Instance
                          </button>
                        </div>

                        <div
                          v-if="
                            !pluginInstances[plugin.id] ||
                            pluginInstances[plugin.id].length === 0
                          "
                          class="empty-instances"
                        >
                          <p class="help-text">
                            No instances configured. Click "Add Instance" to
                            create one.
                          </p>
                        </div>
                        <div v-else class="instances-list">
                          <div
                            v-for="instance in pluginInstances[plugin.id]"
                            :key="instance.id"
                            class="instance-item"
                            :class="{ disabled: !instance.enabled }"
                          >
                            <div class="instance-info">
                              <div class="instance-header">
                                <span
                                  v-if="instance.running !== undefined"
                                  class="running-indicator"
                                  :class="{
                                    running: instance.running,
                                    stopped: !instance.running,
                                  }"
                                  :title="
                                    instance.running
                                      ? '● Green: Instance is running'
                                      : '○ Red: Instance is stopped'
                                  "
                                >
                                  {{ instance.running ? "●" : "○" }}
                                </span>
                                <h5>{{ instance.name }}</h5>
                              </div>
                              <div
                                v-if="instance.config"
                                class="instance-details"
                              >
                                <!-- Show only the most important config value -->
                                <div
                                  v-if="
                                    getInstanceSummary(
                                      plugin.id,
                                      instance.config,
                                    )
                                  "
                                  class="instance-detail-item"
                                >
                                  <span class="instance-detail-value">
                                    {{
                                      getInstanceSummary(
                                        plugin.id,
                                        instance.config,
                                      )
                                    }}
                                  </span>
                                </div>
                              </div>
                            </div>
                            <div class="instance-actions">
                              <label
                                class="toggle-switch-small"
                                :title="
                                  instance.enabled
                                    ? 'Disable and stop instance'
                                    : 'Enable and start instance'
                                "
                              >
                                <input
                                  type="checkbox"
                                  :checked="instance.enabled"
                                  @change="
                                    togglePluginInstance(
                                      instance.id,
                                      $event.target.checked,
                                    )
                                  "
                                />
                                <span class="slider-small" />
                              </label>
                              <button
                                class="btn-icon-only btn-action"
                                title="Edit instance"
                                @click="
                                  openEditInstanceModal(plugin.id, instance)
                                "
                              >
                                ✏️
                              </button>
                              <button
                                class="btn-icon-only btn-action btn-action-danger"
                                title="Delete instance"
                                @click="deletePluginInstance(instance.id)"
                              >
                                🗑️
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                    <!-- End plugin-config -->
                    <div
                      v-else-if="!plugin.enabled"
                      class="plugin-disabled-message"
                    >
                      <p class="help-text">
                        This plugin type is disabled. It won't appear in
                        dropdowns and existing instances will be hidden (but not
                        deleted).
                      </p>
                    </div>
                  </div>
                  <!-- End plugin-item -->
                </div>
                <!-- End plugins-list -->
              </div>
              <!-- End plugins-container -->
            </div>
          </section>
        </template>

        <!-- System Category (continued) -->
        <template v-if="activeCategory === 'system'">
          <!-- Display Power Settings -->
          <section
            class="settings-section collapsible"
            :class="{ expanded: expandedSections.displayPower }"
          >
            <div class="section-header" @click="toggleSection('displayPower')">
              <h2>Display Power Settings</h2>
              <span class="toggle-icon">{{
                expandedSections.displayPower ? "▼" : "▶"
              }}</span>
            </div>
            <div v-show="expandedSections.displayPower" class="section-content">
              <div class="setting-item">
                <label>
                  <input
                    v-model="localConfig.displayScheduleEnabled"
                    type="checkbox"
                    @change="updateDisplayScheduleEnabled"
                  />
                  Enable Display Power Schedule
                </label>
                <span class="help-text"
                  >Automatically turn display off/on at specified times</span
                >
              </div>
              <div
                v-if="localConfig.displayScheduleEnabled"
                class="setting-item"
              >
                <label>Daily Schedule</label>
                <div class="schedule-days">
                  <div
                    v-for="(dayConfig, index) in localConfig.displaySchedule"
                    :key="index"
                    class="schedule-day"
                  >
                    <div class="schedule-day-header">
                      <label>
                        <input
                          v-model="dayConfig.enabled"
                          type="checkbox"
                          @change="updateDisplaySchedule"
                        />
                        {{ getDayName(dayConfig.day) }}
                      </label>
                    </div>
                    <div v-if="dayConfig.enabled" class="schedule-day-times">
                      <div class="schedule-time">
                        <label>On:</label>
                        <input
                          v-model="dayConfig.onTime"
                          type="time"
                          @change="updateDisplaySchedule"
                        />
                      </div>
                      <div class="schedule-time">
                        <label>Off:</label>
                        <input
                          v-model="dayConfig.offTime"
                          type="time"
                          @change="updateDisplaySchedule"
                        />
                      </div>
                    </div>
                  </div>
                </div>
                <span class="help-text"
                  >Configure on/off times for each day of the week. Display will
                  be on during the specified time range.</span
                >
              </div>
              <div class="setting-item">
                <label>Timezone</label>
                <select v-model="localConfig.timezone" @change="updateTimezone">
                  <option :value="null">System Timezone (Default)</option>
                  <option value="UTC">UTC</option>
                  <option value="America/New_York">
                    America/New_York (EST/EDT)
                  </option>
                  <option value="America/Chicago">
                    America/Chicago (CST/CDT)
                  </option>
                  <option value="America/Denver">
                    America/Denver (MST/MDT)
                  </option>
                  <option value="America/Los_Angeles">
                    America/Los_Angeles (PST/PDT)
                  </option>
                  <option value="Europe/London">Europe/London (GMT/BST)</option>
                  <option value="Europe/Paris">Europe/Paris (CET/CEST)</option>
                  <option value="Europe/Berlin">
                    Europe/Berlin (CET/CEST)
                  </option>
                  <option value="Europe/Stockholm">
                    Europe/Stockholm (CET/CEST)
                  </option>
                  <option value="Asia/Tokyo">Asia/Tokyo (JST)</option>
                  <option value="Asia/Shanghai">Asia/Shanghai (CST)</option>
                  <option value="Australia/Sydney">
                    Australia/Sydney (AEDT/AEST)
                  </option>
                </select>
                <span class="help-text"
                  >Timezone for display schedule. Leave as "System Timezone" to
                  use the Pi's timezone.</span
                >
              </div>
              <div class="setting-item">
                <label>
                  <input
                    v-model="localConfig.displayTimeoutEnabled"
                    type="checkbox"
                    @change="updateDisplayTimeout"
                  />
                  Enable Display Timeout (Screensaver)
                </label>
                <span class="help-text"
                  >Turn display off after period of inactivity</span
                >
              </div>
              <div
                v-if="localConfig.displayTimeoutEnabled"
                class="setting-item"
              >
                <label>Display Timeout (seconds)</label>
                <input
                  v-model.number="localConfig.displayTimeout"
                  type="number"
                  min="0"
                  max="3600"
                  step="60"
                  @change="updateDisplayTimeout"
                />
                <span class="help-text"
                  >Turn display off after this many seconds of inactivity (0 =
                  never, max 3600)</span
                >
              </div>
              <div class="setting-item">
                <label>Manual Display Control</label>
                <div class="button-group">
                  <button class="btn-secondary" @click="turnDisplayOn">
                    Turn Display On
                  </button>
                  <button class="btn-secondary" @click="turnDisplayOff">
                    Turn Display Off
                  </button>
                </div>
                <span class="help-text">Manually control display power</span>
              </div>
            </div>
          </section>

          <!-- Reboot Combo Settings -->
          <section
            class="settings-section collapsible"
            :class="{ expanded: expandedSections.rebootCombo }"
          >
            <div class="section-header" @click="toggleSection('rebootCombo')">
              <h2>Reboot Combo Settings</h2>
              <span class="toggle-icon">{{
                expandedSections.rebootCombo ? "▼" : "▶"
              }}</span>
            </div>
            <div v-show="expandedSections.rebootCombo" class="section-content">
              <div class="setting-item">
                <label>First Key</label>
                <select
                  v-model="localConfig.rebootComboKey1"
                  class="setting-select"
                  @change="updateRebootCombo"
                >
                  <option value="KEY_1">KEY_1</option>
                  <option value="KEY_2">KEY_2</option>
                  <option value="KEY_3">KEY_3</option>
                  <option value="KEY_4">KEY_4</option>
                  <option value="KEY_5">KEY_5</option>
                  <option value="KEY_6">KEY_6</option>
                  <option value="KEY_7">KEY_7</option>
                </select>
                <span class="help-text">First key for reboot combo</span>
              </div>
              <div class="setting-item">
                <label>Second Key</label>
                <select
                  v-model="localConfig.rebootComboKey2"
                  class="setting-select"
                  @change="updateRebootCombo"
                >
                  <option value="KEY_1">KEY_1</option>
                  <option value="KEY_2">KEY_2</option>
                  <option value="KEY_3">KEY_3</option>
                  <option value="KEY_4">KEY_4</option>
                  <option value="KEY_5">KEY_5</option>
                  <option value="KEY_6">KEY_6</option>
                  <option value="KEY_7">KEY_7</option>
                </select>
                <span class="help-text">Second key for reboot combo</span>
              </div>
              <div class="setting-item">
                <label>Combo Duration (milliseconds)</label>
                <input
                  v-model.number="localConfig.rebootComboDuration"
                  type="number"
                  min="1000"
                  max="60000"
                  step="1000"
                  @change="updateRebootCombo"
                />
                <span class="help-text"
                  >How long to hold both keys to trigger reboot (1000-60000
                  ms)</span
                >
              </div>
              <div class="setting-item">
                <span class="help-text"
                  >Hold {{ localConfig.rebootComboKey1 }} +
                  {{ localConfig.rebootComboKey2 }} for
                  {{ (localConfig.rebootComboDuration / 1000).toFixed(1) }}
                  seconds to reboot</span
                >
              </div>
            </div>
          </section>

          <!-- Debug & Logging -->
          <section
            class="settings-section collapsible"
            :class="{ expanded: expandedSections.debugLogging }"
          >
            <div class="section-header" @click="toggleSection('debugLogging')">
              <h2>Debug & Logging</h2>
              <span class="toggle-icon">{{
                expandedSections.debugLogging ? "▼" : "▶"
              }}</span>
            </div>
            <div v-show="expandedSections.debugLogging" class="section-content">
              <div class="setting-item">
                <label>
                  <input
                    v-model="localConfig.consoleLogEnabled"
                    type="checkbox"
                    @change="updateConsoleLogSettings"
                  />
                  Enable Console Logging
                </label>
                <span class="help-text"
                  >Enable logging to browser console. When disabled, only errors
                  will be shown.</span
                >
              </div>
              <div v-if="localConfig.consoleLogEnabled" class="setting-item">
                <label>Log Level</label>
                <select
                  v-model="localConfig.consoleLogLevel"
                  @change="updateConsoleLogSettings"
                >
                  <option value="error">Error Only</option>
                  <option value="warn">Warnings & Errors</option>
                  <option value="info">Info, Warnings & Errors</option>
                  <option value="debug">All Logs (Debug)</option>
                </select>
                <span class="help-text"
                  >Controls which log messages are shown in the browser console.
                  Lower levels include higher severity messages.</span
                >
              </div>
            </div>
          </section>

          <!-- Dashboard Refresh Settings -->
          <section
            class="settings-section collapsible"
            :class="{ expanded: expandedSections.dashboardRefresh }"
          >
            <div
              class="section-header"
              @click="toggleSection('dashboardRefresh')"
            >
              <h2>Dashboard Refresh</h2>
              <span class="toggle-icon">{{
                expandedSections.dashboardRefresh ? "▼" : "▶"
              }}</span>
            </div>
            <div
              v-show="expandedSections.dashboardRefresh"
              class="section-content"
            >
              <div class="setting-item">
                <label>Config Polling Interval (seconds)</label>
                <input
                  v-model.number="localConfig.configPollInterval"
                  type="number"
                  min="5"
                  max="300"
                  @change="updateConfigPollInterval"
                />
                <span class="help-text"
                  >How often the dashboard checks for config changes from the
                  server (5-300 seconds). Lower values provide faster updates
                  but increase server load. Default: 30 seconds.</span
                >
              </div>
            </div>
          </section>

          <!-- System Information & Update Settings -->
          <section
            class="settings-section collapsible"
            :class="{ expanded: expandedSections.systemInfo }"
          >
            <div class="section-header" @click="toggleSection('systemInfo')">
              <h2>System Information & Updates</h2>
              <span class="toggle-icon">{{
                expandedSections.systemInfo ? "▼" : "▶"
              }}</span>
            </div>
            <div v-show="expandedSections.systemInfo" class="section-content">
              <!-- System Information -->
              <div class="setting-item">
                <label>Backend Version</label>
                <div class="version-display">
                  <code v-if="localConfig.version">{{
                    localConfig.version
                  }}</code>
                  <span v-else class="help-text"
                    >Version information not available</span
                  >
                </div>
                <span class="help-text">Backend git commit short hash</span>
              </div>
              <div class="setting-item">
                <label>Frontend Version</label>
                <div class="version-display">
                  <code v-if="localConfig.frontendVersion">{{
                    localConfig.frontendVersion
                  }}</code>
                  <span v-else class="help-text"
                    >Version information not available</span
                  >
                </div>
                <span class="help-text">Frontend git commit short hash</span>
              </div>

              <!-- Update Settings -->
              <div class="setting-item">
                <label>Repository URL</label>
                <input
                  v-model="localConfig.gitRepoUrl"
                  type="text"
                  placeholder="https://github.com/user/repo.git"
                  @change="updateGitRepoUrl"
                />
                <span class="help-text"
                  >Git repository URL for updates (e.g.,
                  https://github.com/user/repo.git)</span
                >
              </div>
              <div class="setting-item">
                <label>Git Branch</label>
                <div class="branch-selector">
                  <select
                    v-if="availableBranches.length > 0"
                    v-model="localConfig.gitBranch"
                    @change="updateGitBranch"
                  >
                    <option
                      v-for="branch in availableBranches"
                      :key="branch"
                      :value="branch"
                    >
                      {{ branch }}
                    </option>
                  </select>
                  <input
                    v-else
                    v-model="localConfig.gitBranch"
                    type="text"
                    placeholder="main"
                    @change="updateGitBranch"
                    :disabled="fetchingBranches"
                  />
                  <button
                    class="btn-fetch-branches"
                    :disabled="fetchingBranches || !localConfig.gitRepoUrl"
                    @click="fetchBranches"
                  >
                    {{ fetchingBranches ? "Fetching..." : "🔄 Fetch Branches" }}
                  </button>
                </div>
                <span class="help-text"
                  >Git branch to use when updating. Click "Fetch Branches" to
                  load available branches from the repository.</span
                >
                <div v-if="branchFetchError" class="error-message">
                  {{ branchFetchError }}
                </div>
              </div>
              <div class="setting-item">
                <label>Update from GitHub</label>
                <button
                  class="btn-update"
                  :disabled="updateInProgress"
                  @click="triggerUpdate"
                >
                  {{
                    updateInProgress ? "Updating..." : "⬆️ Update from GitHub"
                  }}
                </button>
                <span class="help-text"
                  >Pull latest code, rebuild, and restart services</span
                >
                <div
                  v-if="updateMessage"
                  class="update-message"
                  :class="updateMessageClass"
                >
                  {{ updateMessage }}
                </div>
              </div>
            </div>
          </section>
        </template>
      </div>
    </div>

    <!-- Actions (Always visible at bottom) -->
    <div class="settings-actions">
      <section class="settings-section">
        <h2>Actions</h2>
        <div class="actions-list">
          <!-- Settings Management -->
          <div class="action-group">
            <h3 class="action-group-title">Settings</h3>
            <div class="action-buttons">
              <button class="btn-save" @click="saveAllSettings">
                💾 Save All Settings
              </button>
              <button class="btn-reset" @click="resetToDefaults">
                ↺ Reset to Defaults
              </button>
            </div>
            <p class="action-group-description">
              Settings save automatically when changed. Use "Save All" to ensure
              everything is saved.
            </p>
          </div>
        </div>
      </section>
    </div>
  </div>

  <!-- Instance Creation/Edit Modal -->
  <div
    v-if="showInstanceModal"
    class="modal-overlay"
    @click.self="closeInstanceModal"
  >
    <div class="modal-content instance-modal">
      <div class="modal-header">
        <h3>
          {{
            editingInstance
              ? `Edit ${editingInstance.name}`
              : `Add ${currentPluginType?.name || "Instance"}`
          }}
        </h3>
        <button class="btn-close-modal" @click="closeInstanceModal">×</button>
      </div>
      <div class="modal-body">
        <div v-if="instanceFormError" class="error-message">
          {{ instanceFormError }}
        </div>
        <form @submit.prevent="saveInstance">
          <!-- Instance Name -->
          <div class="form-group">
            <label>Instance Name</label>
            <input
              v-model="instanceForm.name"
              type="text"
              class="form-input"
              placeholder="Enter instance name"
              required
            />
          </div>

          <!-- Instance-specific fields from instance_config_schema -->
          <template
            v-if="
              currentPluginType?.instance_config_schema &&
              Object.keys(currentPluginType.instance_config_schema).length > 0
            "
          >
            <div
              v-for="(schema, key) in currentPluginType.instance_config_schema"
              :key="key"
              class="form-group"
            >
              <PluginFieldRenderer
                :plugin-id="currentPluginType.id"
                :field-key="key"
                :schema="schema"
                :value="getInstanceFormValue(key, schema)"
                @update="updateInstanceFormValue(key, $event)"
              />
            </div>

            <!-- Show note about global settings if plugin has them -->
            <div
              v-if="
                Object.keys(getGlobalConfigSchema(currentPluginType)).length > 0
              "
              class="form-group"
            >
              <p class="help-text">
                <strong>Note:</strong> Some settings (like API keys) are
                configured in the plugin's global settings above and are shared
                across all instances.
              </p>
            </div>
          </template>

          <!-- Fallback for plugins without instance_config_schema -->
          <template v-else>
            <div class="form-group">
              <p class="help-text">
                This plugin type does not support instance-specific
                configuration.
              </p>
            </div>
          </template>

          <!-- Enable/Disable -->
          <div class="form-group">
            <label>
              <input v-model="instanceForm.enabled" type="checkbox" />
              Enable this instance
            </label>
          </div>

          <!-- Test Connection Button (if plugin supports it) -->
          <div
            v-if="
              currentPluginType?.ui_actions &&
              currentPluginType.ui_actions.some(
                (action) => action.type === 'test',
              )
            "
            class="form-group"
          >
            <button
              type="button"
              class="btn-secondary"
              :disabled="testingInstance"
              @click="testInstanceConnection"
            >
              {{ testingInstance ? "Testing..." : "Test Connection" }}
            </button>
            <div
              v-if="instanceTestStatus"
              :class="
                instanceTestStatus.success ? 'success-message' : 'error-message'
              "
              style="
                margin-top: 0.5rem;
                padding: 0.5rem 1rem;
                border-radius: 4px;
              "
            >
              {{ instanceTestStatus.message }}
            </div>
          </div>

          <div class="modal-actions">
            <button
              type="button"
              class="btn-secondary"
              @click="closeInstanceModal"
            >
              Cancel
            </button>
            <button
              type="submit"
              class="btn-primary"
              :disabled="savingInstance"
            >
              {{ savingInstance ? "Saving..." : "Save" }}
            </button>
          </div>
        </form>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from "vue";
import { useRouter } from "vue-router";
import { useConfigStore } from "../stores/config";
import { useKeyboardStore } from "../stores/keyboard";
import { useCalendarStore } from "../stores/calendar";
import { useModeStore } from "../stores/mode";
import { useImagesStore } from "../stores/images";
import { useThemesStore } from "../stores/themes";
import { useTheme } from "../composables/useTheme";
import axios from "axios";
import PluginFieldRenderer from "../components/PluginFieldRenderer.vue";
import PluginActions from "../components/PluginActions.vue";
import PluginSections from "../components/PluginSections.vue";
import { logError, logWarn, logInfo, logDebug } from "../utils/logger";

const router = useRouter();
const configStore = useConfigStore();
const keyboardStore = useKeyboardStore();
const calendarStore = useCalendarStore();
const modeStore = useModeStore();
const imagesStore = useImagesStore();
const themesStore = useThemesStore();
const theme = useTheme();

const localConfig = ref({
  orientation: "landscape",
  calendarSplit: 70,
  sideViewPosition: "right",
  keyboardType: "7-button",
  keyboardFeedbackEnabled: true,
  keyboardFeedbackMode: "normal",
  photoFrameEnabled: false,
  photoFrameTimeout: 300,
  showUI: true,
  showModeIndicator: true,
  photoRotationInterval: 30,
  calendarViewMode: "month",
  timeFormat: "24h",
  themeMode: "auto",
  selectedTheme: null,
  darkModeStart: 18,
  darkModeEnd: 6,
  displayScheduleEnabled: false,
  displayOffTime: "22:00",
  displayOnTime: "06:00",
  displaySchedule: [
    { day: 0, enabled: true, onTime: "06:00", offTime: "22:00" }, // Monday
    { day: 1, enabled: true, onTime: "06:00", offTime: "22:00" }, // Tuesday
    { day: 2, enabled: true, onTime: "06:00", offTime: "22:00" }, // Wednesday
    { day: 3, enabled: true, onTime: "06:00", offTime: "22:00" }, // Thursday
    { day: 4, enabled: true, onTime: "06:00", offTime: "22:00" }, // Friday
    { day: 5, enabled: true, onTime: "06:00", offTime: "22:00" }, // Saturday
    { day: 6, enabled: true, onTime: "06:00", offTime: "22:00" }, // Sunday
  ],
  displayTimeoutEnabled: false,
  displayTimeout: 0,
  timezone: null,
  gitRepoUrl: "https://github.com/osterbergsimon/calvin.git",
  gitBranch: "main",
  rebootComboKey1: "KEY_1",
  rebootComboKey2: "KEY_7",
  rebootComboDuration: 10000,
  imageDisplayMode: "smart",
  randomizeImages: false,
  clockEnabled: true,
  clockDisplayMode: "header",
  clockShowDate: false,
  clockShowSeconds: false,
  clockPosition: "top-right",
  clockSize: "medium",
  mealPlanCardSize: "medium",
  orientationFlipped: false,
  consoleLogEnabled: true,
  consoleLogLevel: "info",
  configPollInterval: 30,
  version: null,
  frontendVersion: null,
});

// Get frontend version from meta tag in HTML (set at build time)
const getFrontendVersionFromMeta = () => {
  try {
    const metaTag = document.querySelector('meta[name="frontend-version"]');
    if (metaTag) {
      return metaTag.getAttribute("content");
    }
  } catch (error) {
    logWarn(
      "[Settings]",
      "Could not read frontend version from meta tag:",
      error,
    );
  }
  return null;
};

// Category navigation
const categories = [
  { id: "layout", label: "Layout & Display", icon: "📐" },
  { id: "content", label: "Content", icon: "📦" },
  { id: "system", label: "System", icon: "⚙️" },
];

const activeCategory = ref("layout");

// Collapsible sections state
const expandedSections = ref({
  dashboardRefresh: false,
  serviceOrdering: false,
  display: true,
  ui: true,
  photos: true,
  photoFrame: false,
  keyboard: false,
  calendar: false,
  plugins: false,
  displayPower: false,
  rebootCombo: false,
  debugLogging: false,
  systemInfo: true,
  update: false,
  themeSelection: false, // Collapsed by default to save space
});

const toggleSection = (section) => {
  expandedSections.value[section] = !expandedSections.value[section];
};

const currentMappings = ref({});
const calendarSources = ref([]);
const imagesList = ref([]);
const uploading = ref(false);
const uploadError = ref("");
const uploadSuccess = ref("");

// Plugin management
const plugins = ref([]);
const pluginInstances = ref({}); // Store instances by plugin type ID: { [pluginId]: [{ id, name, enabled, running, config }] }
const pluginConfigs = ref({}); // Store configs by plugin type ID
const pluginDisplayOrders = ref({}); // Store display orders for service plugins

// Plugin installation state
const installingPlugin = ref(false);
const enumeratingPlugins = ref(false);
const selectedPluginZip = ref(null);
const githubRepoUrl = ref("");
const githubBranch = ref("");
const availablePlugins = ref([]);
const pluginInstallError = ref("");
const pluginInstallSuccess = ref("");
const pluginRequiresRestart = ref(false);
const pluginBranchSwitched = ref(false);
const pluginActualBranch = ref("");
const showVersionConflictDialog = ref(false);
const versionConflictInfo = ref(null);

// Theme management
const themesList = ref([]);
const loadingThemes = ref(false);
const themeInstallMethod = ref("zip");
const installingTheme = ref(false);
const enumeratingThemes = ref(false);
const selectedThemeZip = ref(null);
const themeGithubRepoUrl = ref("");
const themeGithubBranch = ref("");
const availableThemes = ref([]);
const themeInstallError = ref("");
const themeInstallSuccess = ref("");
const themeBranchSwitched = ref(false);
const themeActualBranch = ref("");

// Instance modal state
const showInstanceModal = ref(false);
const editingInstance = ref(null);
const currentPluginType = ref(null);
// Instance form - dynamically populated from instance_config_schema
const instanceForm = ref({
  name: "",
  enabled: true,
});
const instanceFormError = ref("");
const savingInstance = ref(false);
const testingInstance = ref(false);
const instanceTestStatus = ref(null);
const expandedPlugins = ref({}); // Track which plugin settings are expanded
// const expandedManageImages = ref({}); // Track which plugins have manage images expanded (unused for now)
const pluginFormData = ref({}); // Store form data before saving
const pluginSaveStatus = ref({}); // Store save status per plugin (success/error messages)
const pluginTestStatus = ref({}); // Store test status per plugin
const pluginFetchStatus = ref({}); // Store fetch status per plugin
const testingPlugin = ref({}); // Track which plugins are being tested
const fetchingPlugin = ref({}); // Track which plugins are being fetched
const savingPlugin = ref(null); // Track which plugin is being saved
const calendarPluginTypes = ref([]);
const loadingPlugins = ref(false);

const newCalendarSource = ref({
  type: "google",
  name: "",
  ical_url: "",
});

// Update from GitHub state
const updateInProgress = ref(false);
const updateMessage = ref("");
const updateMessageClass = ref("");

const canAddCalendar = computed(() => {
  return (
    newCalendarSource.value.name.trim() !== "" &&
    newCalendarSource.value.ical_url.trim() !== ""
  );
});

const availableActions = [
  // Mode selection buttons (4 buttons)
  { value: "mode_calendar", label: "Mode: Calendar" },
  { value: "mode_photos", label: "Mode: Photos" },
  { value: "mode_web_services", label: "Mode: Web Services" },
  { value: "mode_spare", label: "Mode: Spare (Future Use)" },

  // Generic context-aware buttons (3 buttons)
  { value: "generic_next", label: "Generic: Next (context-aware)" },
  { value: "generic_prev", label: "Generic: Previous (context-aware)" },
  {
    value: "generic_expand_close",
    label: "Generic: Expand/Close (context-aware)",
  },

  // Legacy/Advanced actions (for direct mapping if needed)
  { value: "mode_settings", label: "Open Settings" },
  { value: "mode_cycle", label: "Cycle Between Modes" },
  { value: "calendar_next", label: "Calendar: Next (context-aware)" },
  { value: "calendar_prev", label: "Calendar: Previous (context-aware)" },
  { value: "calendar_next_month", label: "Calendar: Next Month (legacy)" },
  { value: "calendar_prev_month", label: "Calendar: Previous Month (legacy)" },
  { value: "calendar_expand", label: "Calendar: Expand (context-aware)" },
  { value: "calendar_expand_today", label: "Calendar: Expand Today (legacy)" },
  { value: "calendar_collapse", label: "Calendar: Collapse (direct)" },

  // Image-specific actions
  { value: "images_next", label: "Images: Next" },
  { value: "images_prev", label: "Images: Previous" },
  { value: "photos_enter_fullscreen", label: "Photos: Enter Fullscreen" },
  { value: "photos_exit_fullscreen", label: "Photos: Exit Fullscreen" },

  // Web service-specific actions
  { value: "web_service_1", label: "Web Service 1" },
  { value: "web_service_2", label: "Web Service 2" },
  { value: "web_service_next", label: "Web Service: Next" },
  { value: "web_service_prev", label: "Web Service: Previous" },
  { value: "web_service_close", label: "Web Service: Close/Exit" },

  { value: "none", label: "No Action" },
];

const formatKeyName = (key) => {
  return key.replace("KEY_", "").replace(/_/g, " ").toLowerCase();
};

const goBack = () => {
  modeStore.returnFromSettings();
  router.push("/");
};

const updateOrientation = () => {
  configStore.setOrientation(localConfig.value.orientation);
  saveConfig();
};

const updateOrientationFlipped = () => {
  configStore.setOrientationFlipped(localConfig.value.orientationFlipped);
  saveConfig();
};

const updateApplyDisplayRotation = () => {
  configStore.setApplyDisplayRotation(localConfig.value.applyDisplayRotation);
  saveConfig();
};

const updateMealPlanCardSize = async () => {
  try {
    await configStore.updateConfig({
      mealPlanCardSize: localConfig.value.mealPlanCardSize,
    });
  } catch (error) {
    console.error("Failed to update meal plan card size:", error);
  }
};

const updateConsoleLogSettings = async () => {
  try {
    await configStore.updateConfig({
      consoleLogEnabled: localConfig.value.consoleLogEnabled,
      consoleLogLevel: localConfig.value.consoleLogLevel,
    });
  } catch (error) {
    logError("[Settings]", "Failed to update console log settings:", error);
  }
};

const updateConfigPollInterval = async () => {
  try {
    await configStore.updateConfig({
      configPollInterval: localConfig.value.configPollInterval,
    });
  } catch (error) {
    logError("[Settings]", "Failed to update config polling interval:", error);
  }
};

const updateCalendarSplit = () => {
  configStore.setCalendarSplit(localConfig.value.calendarSplit);
  saveConfig();
};

const updateSideViewPosition = () => {
  configStore.setSideViewPosition(localConfig.value.sideViewPosition);
  saveConfig();
};

const updateKeyboardType = () => {
  // Reload mappings for the new keyboard type
  loadKeyboardMappings();
  saveConfig();
};

const updatePhotoFrameEnabled = async () => {
  try {
    configStore.setPhotoFrameEnabled(localConfig.value.photoFrameEnabled);
    await configStore.updateConfig({
      photoFrameEnabled: localConfig.value.photoFrameEnabled,
    });
  } catch (error) {
    logError("[Settings]", "Failed to update photo frame enabled:", error);
  }
};

const updatePhotoFrameTimeout = async () => {
  try {
    configStore.setPhotoFrameTimeout(localConfig.value.photoFrameTimeout);
    await configStore.updateConfig({
      photoFrameTimeout: localConfig.value.photoFrameTimeout,
    });
  } catch (error) {
    logError("[Settings]", "Failed to update photo frame timeout:", error);
  }
};

const updateShowUI = () => {
  configStore.setShowUI(localConfig.value.showUI);
  saveConfig();
};

const updatePhotoRotationInterval = () => {
  configStore.setPhotoRotationInterval(localConfig.value.photoRotationInterval);
  saveConfig();
};

const updateImageDisplayMode = () => {
  configStore.setImageDisplayMode(localConfig.value.imageDisplayMode);
  saveConfig();
};

const updateRandomizeImages = () => {
  saveConfig();
};

const updateCalendarViewMode = () => {
  configStore.setCalendarViewMode(localConfig.value.calendarViewMode);
  saveConfig();
};

const updateTimeFormat = () => {
  configStore.setTimeFormat(localConfig.value.timeFormat);
  saveConfig();
};

const updateShowModeIndicator = () => {
  configStore.setShowModeIndicator(localConfig.value.showModeIndicator);
  saveConfig();
};

const updateModeIndicatorTimeout = () => {
  configStore.setModeIndicatorTimeout(localConfig.value.modeIndicatorTimeout);
  saveConfig();
};

const updateClockSettings = async () => {
  try {
    await configStore.updateConfig({
      clockEnabled: localConfig.value.clockEnabled,
      clockDisplayMode: localConfig.value.clockDisplayMode,
      clockShowDate: localConfig.value.clockShowDate,
      clockShowSeconds: localConfig.value.clockShowSeconds,
      clockPosition: localConfig.value.clockPosition,
      clockSize: localConfig.value.clockSize,
    });
  } catch (error) {
    console.error("Failed to update clock settings:", error);
  }
};

const updateWeekStartDay = () => {
  configStore.setWeekStartDay(localConfig.value.weekStartDay);
  saveConfig();
};

const updateShowWeekNumbers = () => {
  configStore.setShowWeekNumbers(localConfig.value.showWeekNumbers);
  saveConfig();
};

const updateWeekendDays = (dayValue, event) => {
  if (!localConfig.value.weekendDays) {
    localConfig.value.weekendDays = [];
  }
  if (event.target.checked) {
    if (!localConfig.value.weekendDays.includes(dayValue)) {
      localConfig.value.weekendDays.push(dayValue);
    }
  } else {
    localConfig.value.weekendDays = localConfig.value.weekendDays.filter(
      (d) => d !== dayValue,
    );
  }
  configStore.setWeekendDays(localConfig.value.weekendDays);
  saveConfig();
};

const updateShowRedDays = () => {
  configStore.setShowRedDays(localConfig.value.showRedDays);
  saveConfig();
};

const updateMaxVisibleEvents = () => {
  configStore.setMaxVisibleEvents(localConfig.value.maxVisibleEvents);
  saveConfig();
};

const updateThemeMode = () => {
  configStore.setThemeMode(localConfig.value.themeMode);
  // Theme composable in App.vue will watch config store and update automatically
  saveConfig();
};

const updateDarkModeTime = () => {
  configStore.setDarkModeTime(
    localConfig.value.darkModeStart,
    localConfig.value.darkModeEnd,
  );
  // Theme composable in App.vue will watch config store and update automatically
  saveConfig();
};

const updateDisplayScheduleEnabled = () => {
  saveConfig();
};

const updateDisplaySchedule = () => {
  saveConfig();
};

const getDayName = (day) => {
  const days = [
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
    "Sunday",
  ];
  return days[day] || `Day ${day}`;
};

const updateDisplayTimeout = async () => {
  await saveConfig();
  // Apply timeout settings immediately
  try {
    await axios.post("/api/system/display/timeout/configure");
  } catch (error) {
    console.error("Failed to apply display timeout:", error);
  }
};

const updateTimezone = () => {
  saveConfig();
};

const updateRebootCombo = () => {
  saveConfig();
};

const updateGitBranch = async () => {
  await saveConfig();
};

const updateGitRepoUrl = () => {
  saveConfig();
  // Clear branches when repo URL changes
  availableBranches.value = [];
  branchFetchError.value = null;
};

// Branch fetching state
const availableBranches = ref([]);
const fetchingBranches = ref(false);
const branchFetchError = ref(null);
const showSystemMenu = ref(false);
const installMethod = ref("zip");

const fetchBranches = async () => {
  if (!localConfig.value.gitRepoUrl) {
    branchFetchError.value = "Please enter a repository URL first";
    return;
  }

  fetchingBranches.value = true;
  branchFetchError.value = null;

  try {
    const response = await axios.get("/api/config/git/branches", {
      params: {
        repo_url: localConfig.value.gitRepoUrl,
      },
    });

    availableBranches.value = response.data.branches || [];

    // If current branch is not in the list, keep it as custom
    if (
      localConfig.value.gitBranch &&
      !availableBranches.value.includes(localConfig.value.gitBranch)
    ) {
      // Keep the current branch value
    }
  } catch (error) {
    branchFetchError.value =
      error.response?.data?.detail ||
      error.message ||
      "Failed to fetch branches";
    console.error("Failed to fetch branches:", error);
  } finally {
    fetchingBranches.value = false;
  }
};

// Auto-fetch branches when expanding the system info section
watch(
  () => expandedSections.value.systemInfo,
  (isExpanded) => {
    if (
      isExpanded &&
      localConfig.value.gitRepoUrl &&
      availableBranches.value.length === 0 &&
      !fetchingBranches.value
    ) {
      // Auto-fetch when section is expanded (but only if we haven't fetched yet)
      fetchBranches();
    }
  },
);

const turnDisplayOn = async () => {
  try {
    await axios.post("/api/system/display/power/on");
    alert("Display turned on");
  } catch (error) {
    console.error("Failed to turn display on:", error);
    alert(
      `Error: ${error.response?.data?.detail || error.message || "Failed to turn display on"}`,
    );
  }
};

const turnDisplayOff = async () => {
  try {
    await axios.post("/api/system/display/power/off");
    alert("Display turned off");
  } catch (error) {
    console.error("Failed to turn display off:", error);
    alert(
      `Error: ${error.response?.data?.detail || error.message || "Failed to turn display off"}`,
    );
  }
};

const updateSourceColor = async (sourceId, color) => {
  const source = calendarSources.value.find((s) => s.id === sourceId);
  if (source) {
    await calendarStore.updateSource(sourceId, { ...source, color });
    await loadCalendarSources();
  }
};

const updateSourceShowTime = async (sourceId, showTime) => {
  const source = calendarSources.value.find((s) => s.id === sourceId);
  if (source) {
    await calendarStore.updateSource(sourceId, {
      ...source,
      show_time: showTime,
    });
    await loadCalendarSources();
  }
};

const updateMapping = async (key, action) => {
  currentMappings.value[key] = action;
  await saveKeyboardMappings();
};

const clearMapping = async (key) => {
  currentMappings.value[key] = "none";
  await saveKeyboardMappings();
};

const toggleSource = async (sourceId, enabled) => {
  try {
    const source = calendarSources.value.find((s) => s.id === sourceId);
    if (source) {
      await calendarStore.updateSource(sourceId, { ...source, enabled });
      await loadCalendarSources();
    }
  } catch (error) {
    console.error("Failed to toggle source:", error);
    alert("Failed to update calendar source");
  }
};

const startPluginInstance = async (instanceId) => {
  try {
    const response = await axios.post(
      `/api/plugins/instances/${instanceId}/start`,
    );
    if (response.data.success) {
      // Update local state immediately
      const running = response.data.running || false;

      // Find and update the instance in pluginInstances
      for (const [, instances] of Object.entries(pluginInstances.value)) {
        const instance = instances.find((i) => i.id === instanceId);
        if (instance) {
          instance.running = running;
          break;
        }
      }

      // Also reload calendar sources if it's a calendar plugin
      await loadCalendarSources();
    }
  } catch (error) {
    console.error("Failed to start plugin instance:", error);
    alert(
      `Failed to start plugin: ${error.response?.data?.detail || error.message}`,
    );
  }
};

const stopPluginInstance = async (instanceId) => {
  try {
    const response = await axios.post(
      `/api/plugins/instances/${instanceId}/stop`,
    );
    if (response.data.success) {
      // Update local state immediately
      const running = response.data.running || false;

      // Find and update the instance in pluginInstances
      for (const [, instances] of Object.entries(pluginInstances.value)) {
        const instance = instances.find((i) => i.id === instanceId);
        if (instance) {
          instance.running = running;
          break;
        }
      }

      // Also reload calendar sources if it's a calendar plugin
      await loadCalendarSources();
    }
  } catch (error) {
    console.error("Failed to stop plugin instance:", error);
    alert(
      `Failed to stop plugin: ${error.response?.data?.detail || error.message}`,
    );
  }
};

// Helper functions for aggregated instance status
const getRunningCount = (instances) => {
  return instances.filter((i) => i.running).length;
};

// const getStoppedCount = (instances) => {
//   return instances.filter(i => !i.running).length;
// };

const getAggregatedRunningSymbol = (instances) => {
  const running = getRunningCount(instances);
  const total = instances.length;
  if (running === total) return "●";
  if (running === 0) return "○";
  return "◐"; // Partially running
};

const getAggregatedRunningClass = (instances) => {
  const running = getRunningCount(instances);
  const total = instances.length;
  if (running === total) return "running";
  if (running === 0) return "stopped";
  return "partial";
};

const getAggregatedRunningTitle = (instances) => {
  const running = getRunningCount(instances);
  const total = instances.length;
  const stopped = total - running;
  if (running === total) {
    return `All ${total} instance${total !== 1 ? "s" : ""} running`;
  } else if (running === 0) {
    return `All ${total} instance${total !== 1 ? "s" : ""} stopped`;
  } else {
    return `${running} running, ${stopped} stopped`;
  }
};

const getAggregatedRunningTooltip = (instances) => {
  const running = getRunningCount(instances);
  const total = instances.length;
  const stopped = total - running;
  let statusText = "";
  let colorText = "";

  if (running === total) {
    statusText = `All ${total} instance${total !== 1 ? "s" : ""} running`;
    colorText = "● Green: All instances are running";
  } else if (running === 0) {
    statusText = `All ${total} instance${total !== 1 ? "s" : ""} stopped`;
    colorText = "○ Red: All instances are stopped";
  } else {
    statusText = `${running} running, ${stopped} stopped`;
    colorText = "◐ Orange: Some instances are running";
  }

  return `${colorText}\n${statusText}`;
};

// Sort and group plugins by type
const sortedPluginCategories = computed(() => {
  const typeOrder = ["calendar", "image", "service", "theme"];
  const typeLabels = {
    calendar: "Calendar",
    image: "Image",
    service: "Service",
    theme: "Themes",
  };

  const grouped = {};

  // Group plugins by type (calendar plugins show here but instance management is in Calendar Settings)
  for (const plugin of plugins.value) {
    const type = plugin.type || "service";
    if (!grouped[type]) {
      grouped[type] = [];
    }
    grouped[type].push(plugin);
  }

  // Sort each group by name
  for (const type in grouped) {
    grouped[type].sort((a, b) => a.name.localeCompare(b.name));
  }

  // Create categories in order - always include Themes tab even if empty
  const categories = [];
  for (const type of typeOrder) {
    if (type === "theme") {
      // Always include Themes category, even if empty
      categories.push({
        type,
        label: typeLabels[type],
        plugins: grouped[type] || [],
      });
    } else if (grouped[type] && grouped[type].length > 0) {
      categories.push({
        type,
        label:
          typeLabels[type] || `${type.charAt(0).toUpperCase() + type.slice(1)}`,
        plugins: grouped[type],
      });
    }
  }

  // Add any remaining types not in the order list
  for (const type in grouped) {
    if (!typeOrder.includes(type)) {
      categories.push({
        type,
        label:
          typeLabels[type] || `${type.charAt(0).toUpperCase() + type.slice(1)}`,
        plugins: grouped[type],
      });
    }
  }

  return categories;
});

// Service ordering
const servicePlugins = computed(() => {
  return plugins.value.filter((p) => p.type === "service");
});

const sortedServicePlugins = computed(() => {
  return [...servicePlugins.value].sort((a, b) => {
    const orderA = pluginDisplayOrders.value[a.id] ?? 0;
    const orderB = pluginDisplayOrders.value[b.id] ?? 0;
    if (orderA !== orderB) {
      return orderA - orderB;
    }
    // If same order, sort by name
    return a.name.localeCompare(b.name);
  });
});

// Active plugin tab
const activePluginTab = ref(null);

// Active plugin category based on tab
const activePluginCategory = computed(() => {
  if (!activePluginTab.value && sortedPluginCategories.value.length > 0) {
    return sortedPluginCategories.value[0];
  }
  return (
    sortedPluginCategories.value.find(
      (cat) => cat.type === activePluginTab.value,
    ) || sortedPluginCategories.value[0]
  );
});

// Check if there are any installed (non-built-in) themes
const hasInstalledThemes = computed(() => {
  return plugins.value.some(
    (plugin) => plugin.type === "theme" && plugin._installed,
  );
});

// Set initial tab when categories are loaded
watch(
  sortedPluginCategories,
  (categories) => {
    if (categories.length > 0 && !activePluginTab.value) {
      activePluginTab.value = categories[0].type;
    }
  },
  { immediate: true },
);

// const toggleInstanceEnabled = async (instanceId, enabled) => {
//   try {
//     // Find which plugin type this instance belongs to
//     let pluginType = null;
//     let instance = null;
//     for (const [pluginId, instances] of Object.entries(pluginInstances.value)) {
//       const found = instances.find(i => i.id === instanceId);
//       if (found) {
//         pluginType = pluginId;
//         instance = found;
//         break;
//       }
//     }
//
//     if (!pluginType || !instance) {
//       console.error(`Could not find plugin type for instance ${instanceId}`);
//       return;
//     }
//
//     // For calendar plugins, use the calendar API
//     if (pluginType === 'google' || pluginType === 'ical' || pluginType === 'proton') {
//       const source = calendarSources.value.find(s => s.id === instanceId);
//       if (source) {
//         await calendarStore.updateSource(instanceId, { ...source, enabled });
//         await loadCalendarSources();
//       }
//     } else {
//       // For other plugins, we need to update via the plugin instance API
//       // For now, just reload to get the updated state
//       await loadPlugins();
//     }
//
//     // Start/stop the plugin based on enabled status
//     if (enabled) {
//       // If enabling and not running, start it
//       if (!instance.running) {
//         await startPluginInstance(instanceId);
//       }
//     } else {
//       // If disabling and running, stop it
//       if (instance.running) {
//         await stopPluginInstance(instanceId);
//       }
//     }
//
//     // Reload plugins to update instance status
//     await loadPlugins();
//   } catch (error) {
//     console.error("Failed to toggle instance enabled:", error);
//     alert(`Failed to update instance: ${error.response?.data?.detail || error.message}`);
//   }
// };

const removeSource = async (sourceId) => {
  if (confirm("Are you sure you want to remove this calendar source?")) {
    try {
      await axios.delete(`/api/calendar/sources/${sourceId}`);
      await loadCalendarSources();
    } catch (error) {
      console.error("Failed to remove source:", error);
      alert("Failed to remove calendar source");
    }
  }
};

const loadConfig = async () => {
  try {
    const response = await axios.get("/api/config");
    if (response.data) {
      localConfig.value.orientation = response.data.orientation || "landscape";
      if (response.data.orientationFlipped !== undefined) {
        localConfig.value.orientationFlipped = response.data.orientationFlipped;
      } else if (response.data.orientation_flipped !== undefined) {
        localConfig.value.orientationFlipped =
          response.data.orientation_flipped;
      } else {
        localConfig.value.orientationFlipped = false; // Default
      }
      localConfig.value.calendarSplit = response.data.calendarSplit || 70;
      localConfig.value.keyboardType = response.data.keyboardType || "7-button";
      localConfig.value.keyboardFeedbackEnabled =
        response.data.keyboardFeedbackEnabled ??
        response.data.keyboard_feedback_enabled ??
        true;
      localConfig.value.keyboardFeedbackMode =
        response.data.keyboardFeedbackMode ??
        response.data.keyboard_feedback_mode ??
        "normal";
      localConfig.value.photoFrameEnabled =
        response.data.photoFrameEnabled ??
        response.data.photo_frame_enabled ??
        false;
      localConfig.value.photoFrameTimeout =
        response.data.photoFrameTimeout ??
        response.data.photo_frame_timeout ??
        300;
      localConfig.value.showUI =
        response.data.showUI ?? response.data.show_ui ?? true;
      localConfig.value.photoRotationInterval =
        response.data.photoRotationInterval ??
        response.data.photo_rotation_interval ??
        30;
      localConfig.value.calendarViewMode =
        response.data.calendarViewMode ??
        response.data.calendar_view_mode ??
        "month";
      localConfig.value.timeFormat =
        response.data.timeFormat ?? response.data.time_format ?? "24h";
      localConfig.value.showModeIndicator =
        response.data.showModeIndicator ??
        response.data.show_mode_indicator ??
        true;
      localConfig.value.modeIndicatorTimeout =
        response.data.modeIndicatorTimeout ??
        response.data.mode_indicator_timeout ??
        5;
      localConfig.value.weekStartDay =
        response.data.weekStartDay ?? response.data.week_start_day ?? 0;
      localConfig.value.showWeekNumbers =
        response.data.showWeekNumbers ??
        response.data.show_week_numbers ??
        false;
      localConfig.value.weekendDays = response.data.weekendDays ??
        response.data.weekend_days ?? [0, 6];
      localConfig.value.showRedDays =
        response.data.showRedDays ?? response.data.show_red_days ?? false;
      localConfig.value.maxVisibleEvents =
        response.data.maxVisibleEvents ?? response.data.max_visible_events ?? 4;
      localConfig.value.sideViewPosition =
        response.data.sideViewPosition ??
        response.data.side_view_position ??
        "right";
      // Handle themeMode - check for both camelCase and snake_case
      if (response.data.themeMode !== undefined) {
        localConfig.value.themeMode = response.data.themeMode;
      } else if (response.data.theme_mode !== undefined) {
        localConfig.value.themeMode = response.data.theme_mode;
      } else {
        localConfig.value.themeMode = "auto";
      }
      // Handle darkModeStart - check for both camelCase and snake_case
      if (response.data.darkModeStart !== undefined) {
        localConfig.value.darkModeStart = response.data.darkModeStart;
      } else if (response.data.dark_mode_start !== undefined) {
        localConfig.value.darkModeStart = response.data.dark_mode_start;
      } else {
        localConfig.value.darkModeStart = 18;
      }
      // Handle darkModeEnd - check for both camelCase and snake_case
      if (response.data.darkModeEnd !== undefined) {
        localConfig.value.darkModeEnd = response.data.darkModeEnd;
      } else if (response.data.dark_mode_end !== undefined) {
        localConfig.value.darkModeEnd = response.data.dark_mode_end;
      } else {
        localConfig.value.darkModeEnd = 6;
      }
      // Handle displayScheduleEnabled - check for both camelCase and snake_case
      // Use !== undefined to properly handle false values
      if (response.data.displayScheduleEnabled !== undefined) {
        localConfig.value.displayScheduleEnabled =
          response.data.displayScheduleEnabled;
      } else if (response.data.display_schedule_enabled !== undefined) {
        localConfig.value.displayScheduleEnabled =
          response.data.display_schedule_enabled;
      } else {
        localConfig.value.displayScheduleEnabled = false;
      }
      localConfig.value.displayOffTime =
        response.data.displayOffTime ??
        response.data.display_off_time ??
        "22:00";
      localConfig.value.displayOnTime =
        response.data.displayOnTime ?? response.data.display_on_time ?? "06:00";
      localConfig.value.displayTimeoutEnabled =
        response.data.displayTimeoutEnabled ??
        response.data.display_timeout_enabled ??
        false;
      localConfig.value.displayTimeout =
        response.data.displayTimeout ?? response.data.display_timeout ?? 0;
      // Handle display schedule - ensure it's always set
      if (response.data.displaySchedule !== undefined) {
        if (typeof response.data.displaySchedule === "string") {
          localConfig.value.displaySchedule = JSON.parse(
            response.data.displaySchedule,
          );
        } else {
          localConfig.value.displaySchedule = response.data.displaySchedule;
        }
      } else if (response.data.display_schedule !== undefined) {
        if (typeof response.data.display_schedule === "string") {
          localConfig.value.displaySchedule = JSON.parse(
            response.data.display_schedule,
          );
        } else {
          localConfig.value.displaySchedule = response.data.display_schedule;
        }
      } else {
        // Ensure default schedule is set if not provided
        if (
          !localConfig.value.displaySchedule ||
          localConfig.value.displaySchedule.length === 0
        ) {
          localConfig.value.displaySchedule = [
            { day: 0, enabled: true, onTime: "06:00", offTime: "22:00" }, // Monday
            { day: 1, enabled: true, onTime: "06:00", offTime: "22:00" }, // Tuesday
            { day: 2, enabled: true, onTime: "06:00", offTime: "22:00" }, // Wednesday
            { day: 3, enabled: true, onTime: "06:00", offTime: "22:00" }, // Thursday
            { day: 4, enabled: true, onTime: "06:00", offTime: "22:00" }, // Friday
            { day: 5, enabled: true, onTime: "06:00", offTime: "22:00" }, // Saturday
            { day: 6, enabled: true, onTime: "06:00", offTime: "22:00" }, // Sunday
          ];
        }
      }
      localConfig.value.rebootComboKey1 =
        response.data.rebootComboKey1 ??
        response.data.reboot_combo_key1 ??
        "KEY_1";
      localConfig.value.rebootComboKey2 =
        response.data.rebootComboKey2 ??
        response.data.reboot_combo_key2 ??
        "KEY_7";
      localConfig.value.rebootComboDuration =
        response.data.rebootComboDuration ??
        response.data.reboot_combo_duration ??
        10000;
      localConfig.value.imageDisplayMode =
        response.data.imageDisplayMode ??
        response.data.image_display_mode ??
        "smart";
      localConfig.value.timezone = response.data.timezone ?? null;
      // Handle clock settings
      if (response.data.clockEnabled !== undefined) {
        localConfig.value.clockEnabled = response.data.clockEnabled;
      } else if (response.data.clock_enabled !== undefined) {
        localConfig.value.clockEnabled = response.data.clock_enabled;
      } else {
        localConfig.value.clockEnabled = true; // Default
      }
      if (response.data.clockDisplayMode !== undefined) {
        localConfig.value.clockDisplayMode = response.data.clockDisplayMode;
      } else if (response.data.clock_display_mode !== undefined) {
        localConfig.value.clockDisplayMode = response.data.clock_display_mode;
      } else {
        localConfig.value.clockDisplayMode = "header"; // Default
      }
      if (response.data.clockShowDate !== undefined) {
        localConfig.value.clockShowDate = response.data.clockShowDate;
      } else if (response.data.clock_show_date !== undefined) {
        localConfig.value.clockShowDate = response.data.clock_show_date;
      } else {
        localConfig.value.clockShowDate = false; // Default
      }
      if (response.data.clockShowSeconds !== undefined) {
        localConfig.value.clockShowSeconds = response.data.clockShowSeconds;
      } else if (response.data.clock_show_seconds !== undefined) {
        localConfig.value.clockShowSeconds = response.data.clock_show_seconds;
      } else {
        localConfig.value.clockShowSeconds = false; // Default
      }
      if (response.data.clockPosition !== undefined) {
        localConfig.value.clockPosition = response.data.clockPosition;
      } else if (response.data.clock_position !== undefined) {
        localConfig.value.clockPosition = response.data.clock_position;
      } else {
        localConfig.value.clockPosition = "top-right"; // Default
      }
      if (response.data.clockSize !== undefined) {
        localConfig.value.clockSize = response.data.clockSize;
      } else if (response.data.clock_size !== undefined) {
        localConfig.value.clockSize = response.data.clock_size;
      } else {
        localConfig.value.clockSize = "medium"; // Default
      }
      if (response.data.mealPlanCardSize !== undefined) {
        localConfig.value.mealPlanCardSize = response.data.mealPlanCardSize;
      } else if (response.data.meal_plan_card_size !== undefined) {
        localConfig.value.mealPlanCardSize = response.data.meal_plan_card_size;
      } else {
        localConfig.value.mealPlanCardSize = "medium"; // Default
      }
      if (response.data.consoleLogEnabled !== undefined) {
        localConfig.value.consoleLogEnabled = response.data.consoleLogEnabled;
      } else if (response.data.console_log_enabled !== undefined) {
        localConfig.value.consoleLogEnabled = response.data.console_log_enabled;
      } else {
        localConfig.value.consoleLogEnabled = true; // Default to enabled for backwards compatibility
      }
      if (response.data.consoleLogLevel !== undefined) {
        localConfig.value.consoleLogLevel = response.data.consoleLogLevel;
      } else if (response.data.console_log_level !== undefined) {
        localConfig.value.consoleLogLevel = response.data.console_log_level;
      } else {
        localConfig.value.consoleLogLevel = "info"; // Default to 'info' level
      }
      if (response.data.configPollInterval !== undefined) {
        localConfig.value.configPollInterval = response.data.configPollInterval;
      } else if (response.data.config_poll_interval !== undefined) {
        localConfig.value.configPollInterval =
          response.data.config_poll_interval;
      } else {
        localConfig.value.configPollInterval = 30; // Default to 30 seconds
      }
      localConfig.value.gitBranch =
        response.data.gitBranch ?? response.data.git_branch ?? "main";
      localConfig.value.version = response.data.version ?? null;
      // Get frontend version from meta tag (most reliable) or fallback to API
      localConfig.value.frontendVersion =
        getFrontendVersionFromMeta() ??
        response.data.frontendVersion ??
        response.data.frontend_version ??
        null;
      keyboardStore.setKeyboardType(localConfig.value.keyboardType);
    }
  } catch (error) {
    console.error("Failed to load config:", error);
  }
};

const loadKeyboardMappings = async () => {
  try {
    await keyboardStore.fetchMappings();
    const type = localConfig.value.keyboardType;
    // Mappings structure: { "7-button": { "KEY_1": "action" }, "standard": { ... } }
    if (keyboardStore.mappings[type]) {
      currentMappings.value = { ...keyboardStore.mappings[type] };
    } else {
      currentMappings.value = {};
    }
  } catch (error) {
    console.error("Failed to load keyboard mappings:", error);
  }
};

const loadCalendarSources = async () => {
  try {
    await calendarStore.fetchSources();
    calendarSources.value = calendarStore.sources;
  } catch (error) {
    console.error("Failed to load calendar sources:", error);
  }
};

// loadWebServices removed - instances are now loaded through loadPlugins

const loadImages = async () => {
  try {
    await imagesStore.fetchImages();
    imagesList.value = imagesStore.images;
  } catch (error) {
    console.error("Failed to load images:", error);
  }
};

const handleFileSelectFromSection = async (files, _section) => {
  // Handle file upload from PluginSections component
  if (!files || files.length === 0) return;

  uploading.value = true;
  uploadError.value = "";
  uploadSuccess.value = "";

  try {
    const uploadPromises = Array.from(files).map((file) =>
      imagesStore.uploadImage(file),
    );
    await Promise.all(uploadPromises);
    uploadSuccess.value = `Successfully uploaded ${files.length} image(s)`;
    await loadImages();
    // Clear success message after 3 seconds
    setTimeout(() => {
      uploadSuccess.value = "";
    }, 3000);
  } catch (error) {
    uploadError.value =
      error.response?.data?.detail ||
      error.message ||
      "Failed to upload images";
    console.error("Failed to upload images:", error);
    // Clear error message after 5 seconds
    setTimeout(() => {
      uploadError.value = "";
    }, 5000);
  } finally {
    uploading.value = false;
  }
};

// const handleFileSelect = async (event) => {
//   const files = event.target.files;
//   if (!files || files.length === 0) return;
//
//   uploading.value = true;
//   uploadError.value = "";
//   uploadSuccess.value = "";
//
//   try {
//     const uploadPromises = Array.from(files).map((file) => imagesStore.uploadImage(file));
//     await Promise.all(uploadPromises);
//     uploadSuccess.value = `Successfully uploaded ${files.length} image(s)`;
//     await loadImages();
//     // Clear file input
//     event.target.value = "";
//     // Clear success message after 3 seconds
//     setTimeout(() => {
//       uploadSuccess.value = "";
//     }, 3000);
//   } catch (error) {
//     uploadError.value = error.response?.data?.detail || error.message || "Failed to upload images";
//     console.error("Failed to upload images:", error);
//     // Clear error message after 5 seconds
//     setTimeout(() => {
//       uploadError.value = "";
//     }, 5000);
//   } finally {
//     uploading.value = false;
//   }
// };

const deleteImage = async (imageId) => {
  if (!confirm("Are you sure you want to delete this image?")) {
    return;
  }

  try {
    await imagesStore.deleteImage(imageId);
    await loadImages();
  } catch (error) {
    console.error("Failed to delete image:", error);
    alert(
      `Error: ${error.response?.data?.detail || error.message || "Failed to delete image"}`,
    );
  }
};

// const formatFileSize = (bytes) => {
//   if (bytes === 0) return "0 Bytes";
//   const k = 1024;
//   const sizes = ["Bytes", "KB", "MB", "GB"];
//   const i = Math.floor(Math.log(bytes) / Math.log(k));
//   return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + " " + sizes[i];
// };

// const handleThumbnailError = (event) => {
//   // Hide broken thumbnail images
//   event.target.style.display = "none";
// };

const addCalendarSource = async () => {
  if (!canAddCalendar.value) {
    alert("Please fill in calendar name and URL");
    return;
  }

  try {
    // Generate a unique ID for the calendar source
    const sourceId = `${newCalendarSource.value.type}-${Date.now()}`;

    const source = {
      id: sourceId,
      type: newCalendarSource.value.type,
      name: newCalendarSource.value.name.trim(),
      ical_url: newCalendarSource.value.ical_url.trim(),
      enabled: true,
    };

    await axios.post("/api/calendar/sources", source);

    // Reset form
    newCalendarSource.value = {
      type: "google",
      name: "",
      ical_url: "",
    };

    // Reload sources
    await loadCalendarSources();
  } catch (error) {
    console.error("Failed to add calendar source:", error);
    const errorMessage =
      error.response?.data?.detail ||
      error.message ||
      "Failed to add calendar source";
    alert(`Error: ${errorMessage}`);
  }
};

// Web service functions removed - now handled through instance management

const saveConfig = async () => {
  try {
    const response = await axios.post("/api/config", {
      orientation: localConfig.value.orientation,
      orientationFlipped: localConfig.value.orientationFlipped,
      applyDisplayRotation: localConfig.value.applyDisplayRotation,
      calendarSplit: localConfig.value.calendarSplit,
      keyboardType: localConfig.value.keyboardType,
      keyboardFeedbackEnabled: localConfig.value.keyboardFeedbackEnabled,
      keyboardFeedbackMode: localConfig.value.keyboardFeedbackMode,
      photoFrameEnabled: localConfig.value.photoFrameEnabled,
      photoFrameTimeout: localConfig.value.photoFrameTimeout,
      showUI: localConfig.value.showUI,
      showModeIndicator: localConfig.value.showModeIndicator,
      modeIndicatorTimeout: localConfig.value.modeIndicatorTimeout,
      photoRotationInterval: localConfig.value.photoRotationInterval,
      calendarViewMode: localConfig.value.calendarViewMode,
      timeFormat: localConfig.value.timeFormat,
      weekStartDay: localConfig.value.weekStartDay,
      showWeekNumbers: localConfig.value.showWeekNumbers,
      weekendDays: localConfig.value.weekendDays,
      showRedDays: localConfig.value.showRedDays,
      maxVisibleEvents: localConfig.value.maxVisibleEvents,
      sideViewPosition: localConfig.value.sideViewPosition,
      themeMode: localConfig.value.themeMode,
      darkModeStart: localConfig.value.darkModeStart,
      darkModeEnd: localConfig.value.darkModeEnd,
      displayScheduleEnabled: localConfig.value.displayScheduleEnabled,
      displayOffTime: localConfig.value.displayOffTime,
      displayOnTime: localConfig.value.displayOnTime,
      displaySchedule: localConfig.value.displaySchedule,
      displayTimeoutEnabled: localConfig.value.displayTimeoutEnabled,
      displayTimeout: localConfig.value.displayTimeout,
      rebootComboKey1: localConfig.value.rebootComboKey1,
      rebootComboKey2: localConfig.value.rebootComboKey2,
      rebootComboDuration: localConfig.value.rebootComboDuration,
      imageDisplayMode: localConfig.value.imageDisplayMode,
      timezone: localConfig.value.timezone,
      gitBranch: localConfig.value.gitBranch,
      consoleLogEnabled: localConfig.value.consoleLogEnabled,
      consoleLogLevel: localConfig.value.consoleLogLevel,
      configPollInterval: localConfig.value.configPollInterval,
    });

    // Refresh the config store to ensure all components have the latest settings
    await configStore.fetchConfig();

    return response.data;
  } catch (error) {
    logError("[Settings]", "Failed to save config:", error);
    throw error;
  }
};

const saveKeyboardMappings = async () => {
  try {
    const type = localConfig.value.keyboardType;
    const mappings = {
      [type]: { ...currentMappings.value },
    };
    await keyboardStore.updateMappings(mappings);
  } catch (error) {
    logError("[Settings]", "Failed to save keyboard mappings:", error);
  }
};

const saveAllSettings = async () => {
  try {
    await saveConfig();
    await saveKeyboardMappings();
    alert(
      "Settings saved successfully! The dashboard will update automatically.",
    );
  } catch (error) {
    alert(
      `Failed to save settings: ${error.response?.data?.detail || error.message || "Unknown error"}`,
    );
  }
};

const resetToDefaults = async () => {
  if (confirm("Are you sure you want to reset all settings to defaults?")) {
    localConfig.value = {
      orientation: "landscape",
      calendarSplit: 70,
      keyboardType: "7-button",
      keyboardFeedbackEnabled: true,
      keyboardFeedbackMode: "normal",
      photoFrameEnabled: false,
      photoFrameTimeout: 300,
      showUI: true,
      showModeIndicator: true,
      modeIndicatorTimeout: 5,
      photoRotationInterval: 30,
      calendarViewMode: "month",
      timeFormat: "24h",
      weekStartDay: 0,
      showWeekNumbers: false,
      sideViewPosition: "right",
      themeMode: "auto",
      darkModeStart: 18,
      darkModeEnd: 6,
      gitBranch: "main",
      configPollInterval: 30,
    };
    keyboardStore.setKeyboardType("7-button");
    // Reset mappings to defaults
    const defaultMappings = {
      "7-button": {
        KEY_1: "generic_next", // Generic Next (context-aware)
        KEY_2: "generic_prev", // Generic Previous (context-aware)
        KEY_3: "generic_expand_close", // Generic Expand/Close (context-aware)
        KEY_4: "mode_calendar", // Mode: Calendar
        KEY_5: "mode_photos", // Mode: Photos
        KEY_6: "mode_web_services", // Mode: Web Services
        KEY_7: "mode_spare", // Mode: Spare
      },
      standard: {
        KEY_RIGHT: "generic_next", // Generic Next (context-aware)
        KEY_LEFT: "generic_prev", // Generic Previous (context-aware)
        KEY_UP: "generic_expand_close", // Generic Expand/Close (context-aware)
        KEY_DOWN: "mode_calendar", // Mode: Calendar
        KEY_SPACE: "mode_photos", // Mode: Photos
        KEY_1: "mode_web_services", // Mode: Web Services
        KEY_2: "mode_spare", // Mode: Spare
        KEY_S: "mode_settings", // Settings (separate)
      },
    };
    currentMappings.value = {
      ...defaultMappings[localConfig.value.keyboardType],
    };
    await saveAllSettings();
  }
};

const triggerUpdate = async () => {
  if (updateInProgress.value) return;

  updateInProgress.value = true;
  updateMessage.value = "Saving settings and starting update...";
  updateMessageClass.value = "info";

  try {
    // Ensure config is saved before triggering update (especially git branch)
    await saveConfig();

    const response = await axios.post("/api/system/update");
    updateMessage.value =
      response.data.message || "Update started successfully";
    updateMessageClass.value = "info";

    // Poll for update status
    let pollCount = 0;
    const maxPolls = 120; // 10 minutes max (120 * 5 seconds)

    const checkStatus = async () => {
      pollCount++;

      // Safety timeout
      if (pollCount > maxPolls) {
        updateInProgress.value = false;
        updateMessage.value =
          "Update is taking longer than expected. Please check the logs manually.";
        updateMessageClass.value = "error";
        return;
      }

      try {
        const statusResponse = await axios.get("/api/system/update/status");
        const status = statusResponse.data.status;
        const lastLog = statusResponse.data.last_log || "";
        const message = statusResponse.data.message || "";

        // Extract commit information
        const currentCommit = statusResponse.data.current_commit_short;
        const currentCommitMsg = statusResponse.data.current_commit_msg;
        const newCommit = statusResponse.data.new_commit_short;
        const newCommitMsg = statusResponse.data.new_commit_msg;
        const backendRestarted = statusResponse.data.backend_restarted;

        // Build commit info display
        let commitInfo = "";
        if (currentCommit && newCommit && currentCommit !== newCommit) {
          commitInfo = `\n📦 Updating: ${currentCommit} → ${newCommit}`;
          if (newCommitMsg) {
            commitInfo += `\n   "${newCommitMsg}"`;
          }
        } else if (newCommit) {
          commitInfo = `\n📦 Commit: ${newCommit}`;
          if (newCommitMsg) {
            commitInfo += `\n   "${newCommitMsg}"`;
          }
        }

        if (status === "idle" || status === "completed") {
          // Only reload if backend has restarted (ensures all changes are complete)
          if (backendRestarted) {
            updateInProgress.value = false;
            updateMessage.value = `✅ Update completed successfully!${commitInfo}\n\nReloading page...`;
            updateMessageClass.value = "success";
            // Reload page after a delay to show updated frontend
            setTimeout(() => {
              window.location.reload();
            }, 2000);
          } else {
            // Update complete but backend not restarted yet, keep checking
            updateMessage.value = `✅ Update complete, waiting for backend restart...${commitInfo}`;
            updateMessageClass.value = "info";
            setTimeout(checkStatus, 3000);
          }
        } else if (status === "error") {
          updateInProgress.value = false;
          updateMessage.value = `❌ Update failed: ${message}${commitInfo}\n\nLast log:\n${lastLog}`;
          updateMessageClass.value = "error";
        } else if (status === "running") {
          // Show progress with commit info and last log lines
          const logLines = lastLog
            .split("\n")
            .filter((line) => line.trim())
            .slice(-3);
          let progressText = message || "Update in progress...";
          if (commitInfo) {
            progressText = `${progressText}${commitInfo}`;
          }
          if (logLines.length > 0) {
            progressText += `\n\n${logLines.join("\n")}`;
          }
          updateMessage.value = `🔄 ${progressText}`;
          updateMessageClass.value = "info";
          // Check again in 3 seconds for more responsive updates
          setTimeout(checkStatus, 3000);
        } else {
          // Unknown status, keep checking
          updateMessage.value = `⏳ ${message || "Checking update status..."}${commitInfo}`;
          updateMessageClass.value = "info";
          setTimeout(checkStatus, 3000);
        }
      } catch (error) {
        logError("[Settings]", "Failed to check update status:", error);
        // Continue checking, but show error
        updateMessage.value = `⚠️ Error checking status: ${error.message}. Retrying...`;
        updateMessageClass.value = "info";
        setTimeout(checkStatus, 5000);
      }
    };

    // Start checking status after 1 second
    setTimeout(checkStatus, 1000);
  } catch (error) {
    updateInProgress.value = false;
    updateMessage.value = `❌ Failed to start update: ${error.response?.data?.detail || error.message || "Unknown error"}`;
    updateMessageClass.value = "error";
    logError("[Settings]", "Failed to trigger update:", error);
  }
};

const uninstallPlugin = async (pluginId, itemType = null) => {
  const plugin = plugins.value.find((p) => p.id === pluginId);
  const pluginName = plugin?.name || pluginId;
  const isTheme = itemType === "theme" || plugin?.type === "theme";
  const itemName = isTheme ? "theme" : "plugin";

  const confirmMessage = isTheme
    ? `Are you sure you want to uninstall theme "${pluginName}"?\n\nThis will:\n- Remove all theme files\n- Remove frontend theme assets\n\nThis action cannot be undone.`
    : `Are you sure you want to uninstall "${pluginName}"?\n\nThis will:\n- Remove all plugin files\n- Delete all plugin instances\n- Remove frontend components\n\nThis action cannot be undone.`;

  if (!confirm(confirmMessage)) {
    return;
  }

  try {
    const params = itemType ? new URLSearchParams({ item_type: itemType }) : "";
    await axios.delete(
      `/api/plugins/installed/${pluginId}${params ? `?${params}` : ""}`,
    );
    // Reload plugins to update the list
    await loadPlugins();
    alert(
      `${itemName.charAt(0).toUpperCase() + itemName.slice(1)} "${pluginName}" uninstalled successfully.`,
    );
  } catch (error) {
    const errorMsg =
      error.response?.data?.detail ||
      error.message ||
      `Failed to uninstall ${itemName}`;
    alert(`Failed to uninstall ${itemName}: ${errorMsg}`);
    console.error(`Failed to uninstall ${itemName}:`, error);
  }
};

const restartBackend = async () => {
  if (
    !confirm(
      "Are you sure you want to restart the backend server?\n\nThe server will be unavailable for a few seconds while restarting.",
    )
  ) {
    return;
  }

  try {
    await axios.post("/api/system/restart-backend");
    alert(
      "Backend restart initiated. The server will restart shortly. This page will reload automatically.",
    );
    // Wait a bit then reload
    setTimeout(() => {
      window.location.reload();
    }, 3000);
  } catch (error) {
    const errorMsg =
      error.response?.data?.detail ||
      error.message ||
      "Failed to restart backend";
    alert(
      `Failed to restart backend: ${errorMsg}\n\nYou may need to restart manually via SSH.`,
    );
    console.error("Failed to restart backend:", error);
  }
};

const restartFrontend = async () => {
  if (
    !confirm(
      "Are you sure you want to restart the frontend server?\n\nThe frontend will be unavailable for a few seconds while restarting.",
    )
  ) {
    return;
  }

  try {
    await axios.post("/api/system/restart-frontend");
    alert(
      "Frontend restart initiated. The server will restart shortly. This page will reload automatically.",
    );
    // Wait a bit then reload
    setTimeout(() => {
      window.location.reload();
    }, 3000);
  } catch (error) {
    const errorMsg =
      error.response?.data?.detail ||
      error.message ||
      "Failed to restart frontend";
    alert(
      `Failed to restart frontend: ${errorMsg}\n\nYou may need to restart manually via SSH.`,
    );
    console.error("Failed to restart frontend:", error);
  }
};

const reloadUI = async () => {
  // Just reload the page (client-side reload)
  window.location.reload();
};

const loadPlugins = async () => {
  loadingPlugins.value = true;
  try {
    // Load both plugin types and installed plugins to mark which are installed
    const [pluginsResponse, installedResponse] = await Promise.all([
      axios.get("/api/plugins"),
      axios
        .get("/api/plugins/installed")
        .catch(() => ({ data: { plugins: [] } })),
    ]);

    const installedPluginIds = new Set(
      (installedResponse.data.plugins || []).map((p) => p.id || p.get?.("id")),
    );

    plugins.value = (pluginsResponse.data.plugins || []).map((plugin) => {
      // Mark if plugin/theme is installed
      // Built-in themes are not marked as installed, but installed themes should be
      if (plugin.type === "theme") {
        // For themes: only mark as installed if it's not built-in and is in the installed list
        plugin._installed =
          !plugin.is_builtin && installedPluginIds.has(plugin.id);
      } else {
        // For regular plugins: mark as installed if in the installed list
        plugin._installed = installedPluginIds.has(plugin.id);
      }

      // Ensure config_schema is always an object
      if (plugin.config_schema && typeof plugin.config_schema === "string") {
        try {
          plugin.config_schema = JSON.parse(plugin.config_schema);
        } catch (e) {
          console.error(
            `Failed to parse config_schema for plugin ${plugin.id}:`,
            e,
          );
          plugin.config_schema = {};
        }
      } else if (
        !plugin.config_schema ||
        typeof plugin.config_schema !== "object"
      ) {
        plugin.config_schema = {};
      }
      // Ensure instance_config_schema is always an object
      if (
        plugin.instance_config_schema &&
        typeof plugin.instance_config_schema === "string"
      ) {
        try {
          plugin.instance_config_schema = JSON.parse(
            plugin.instance_config_schema,
          );
        } catch (e) {
          console.error(
            `Failed to parse instance_config_schema for plugin ${plugin.id}:`,
            e,
          );
          plugin.instance_config_schema = {};
        }
      } else if (
        !plugin.instance_config_schema ||
        typeof plugin.instance_config_schema !== "object"
      ) {
        plugin.instance_config_schema = {};
      }
      // Debug log to verify instance_config_schema is loaded
      if (
        plugin.type === "service" &&
        Object.keys(plugin.instance_config_schema).length > 0
      ) {
        logDebug(
          "[Settings]",
          `Plugin ${plugin.id} has instance_config_schema with ${Object.keys(plugin.instance_config_schema).length} fields`,
        );
      }
      // Ensure ui_actions and ui_sections are arrays
      if (!plugin.ui_actions || !Array.isArray(plugin.ui_actions)) {
        plugin.ui_actions = [];
      }
      if (!plugin.ui_sections || !Array.isArray(plugin.ui_sections)) {
        plugin.ui_sections = [];
      }
      return plugin;
    });

    // Load instances for each plugin type (skip themes - they don't have instances)
    for (const plugin of plugins.value) {
      if (plugin.type === "theme") {
        // Themes don't have instances
        pluginInstances.value[plugin.id] = [];
        continue;
      }
      try {
        const instancesResponse = await axios.get(
          `/api/plugins/${plugin.id}/instances`,
        );
        pluginInstances.value[plugin.id] =
          instancesResponse.data.instances || [];
      } catch (error) {
        console.error(
          `Failed to load instances for plugin ${plugin.id}:`,
          error,
        );
        pluginInstances.value[plugin.id] = [];
      }
    }

    // Load configs for each plugin type (skip themes - they don't have configs)
    for (const plugin of plugins.value) {
      if (plugin.type === "theme") {
        // Themes don't have configs
        pluginConfigs.value[plugin.id] = {};
        continue;
      }
      try {
        const configResponse = await axios.get(
          `/api/plugins/${plugin.id}/config`,
        );
        const rawConfig = configResponse.data.config || {};
        // Don't log sensitive data - configs from backend should already have sensitive fields removed
        logDebug(
          "[Settings]",
          `Loaded config for ${plugin.id}:`,
          Object.keys(rawConfig),
        );

        // Clean config values - ensure all are strings, not objects
        const cleanedConfig = {};
        for (const [key, value] of Object.entries(rawConfig)) {
          if (value === null || value === undefined) {
            cleanedConfig[key] = "";
          } else if (typeof value === "object") {
            // If it's an object, try to extract the actual value
            logWarn(
              "[Settings]",
              `Found object value for ${plugin.id}.${key}:`,
              value,
            );
            cleanedConfig[key] = value.value || value.default || "";
          } else {
            cleanedConfig[key] = String(value);
          }
        }
        logDebug(
          "[Settings]",
          `Cleaned config for ${plugin.id}:`,
          cleanedConfig,
        );

        pluginConfigs.value[plugin.id] = cleanedConfig;
        // Initialize display order for service plugins
        if (plugin.type === "service") {
          pluginDisplayOrders.value[plugin.id] =
            cleanedConfig.display_order ?? 0;
        }
        // Initialize form data with saved config for all plugins
        // This allows plugins to track form state separately from saved config
        pluginFormData.value[plugin.id] = { ...cleanedConfig };
      } catch (error) {
        logError(
          "[Settings]",
          `Failed to load config for plugin ${plugin.id}:`,
          error,
        );
        pluginConfigs.value[plugin.id] = {};
      }
    }
  } catch (error) {
    logError("[Settings]", "Failed to load plugins:", error);
  } finally {
    loadingPlugins.value = false;
  }
};

const handlePluginZipSelect = async (event) => {
  const file = event.target.files?.[0];
  if (!file) return;

  selectedPluginZip.value = file;
  await installPluginFromZip(file, event.target);
};

const installPluginFromZip = async (file, fileInput = null) => {
  installingPlugin.value = true;
  pluginInstallError.value = "";
  pluginInstallSuccess.value = "";
  pluginRequiresRestart.value = false;
  pluginBranchSwitched.value = false;
  pluginActualBranch.value = "";

  try {
    const formData = new FormData();
    formData.append("file", file);

    const response = await axios.post("/api/plugins/install", formData, {
      headers: {
        "Content-Type": "multipart/form-data",
      },
    });

    pluginInstallSuccess.value =
      response.data.message || "Plugin installed successfully!";
    pluginRequiresRestart.value = response.data.requires_restart || false;
    selectedPluginZip.value = null;
    // Clear file input
    if (fileInput) {
      fileInput.value = "";
    }

    // Reload plugins to show the newly installed one (though it won't appear until restart)
    await loadPlugins();

    // Don't auto-clear success message if restart is required
    if (!pluginRequiresRestart.value) {
      setTimeout(() => {
        pluginInstallSuccess.value = "";
      }, 5000);
    }
  } catch (error) {
    // Check for version conflict
    const errorDetail = error.response?.data?.detail || error.message || "";
    if (errorDetail.includes("older than") || errorDetail.includes("version")) {
      // This is a version conflict - could show dialog here if needed
      pluginInstallError.value = errorDetail;
    } else {
      pluginInstallError.value = errorDetail || "Failed to install plugin";
    }
    console.error("Failed to install plugin:", error);
    // Clear error message after 10 seconds
    setTimeout(() => {
      pluginInstallError.value = "";
    }, 10000);
  } finally {
    installingPlugin.value = false;
  }
};

const enumeratePluginsFromGitHub = async () => {
  if (!githubRepoUrl.value) return;

  enumeratingPlugins.value = true;
  pluginInstallError.value = "";
  availablePlugins.value = [];
  pluginBranchSwitched.value = false;
  pluginActualBranch.value = "";

  try {
    const params = new URLSearchParams({
      repo_url: githubRepoUrl.value,
    });
    if (githubBranch.value) {
      params.append("branch", githubBranch.value);
    }

    const response = await axios.get(
      `/api/plugins/enumerate-from-github?${params.toString()}`,
    );

    // Combine plugins and themes into a single list
    const plugins = response.data.plugins || [];
    const themes = response.data.themes || [];
    availablePlugins.value = [
      ...plugins.map((p) => ({ ...p, type: p.type || "service" })),
      ...themes.map((t) => ({ ...t, type: "theme" })),
    ];
    pluginBranchSwitched.value = response.data.branch_switched || false;
    pluginActualBranch.value =
      response.data.branch || githubBranch.value || "main";

    if (availablePlugins.value.length === 0) {
      pluginInstallError.value =
        "No plugins or themes found in this repository. Make sure it contains plugin directories with plugin.json and plugin.py files, or theme directories with theme.json files.";
    }
  } catch (error) {
    pluginInstallError.value =
      error.response?.data?.detail ||
      error.message ||
      "Failed to enumerate plugins from GitHub";
    console.error("Failed to enumerate plugins:", error);
    availablePlugins.value = [];
  } finally {
    enumeratingPlugins.value = false;
  }
};

const installPluginFromGitHub = async (pluginPath = null) => {
  if (!githubRepoUrl.value) return;

  // If pluginPath is provided, it's a specific plugin. Otherwise, try direct install (legacy)
  if (!pluginPath) {
    pluginInstallError.value =
      "Please browse plugins first and select a specific plugin to install.";
    return;
  }

  installingPlugin.value = true;
  pluginInstallError.value = "";
  pluginInstallSuccess.value = "";
  pluginRequiresRestart.value = false;
  pluginBranchSwitched.value = false;
  pluginActualBranch.value = "";

  try {
    const payload = {
      repo_url: githubRepoUrl.value,
      plugin_path: pluginPath,
    };
    if (githubBranch.value) {
      payload.branch = githubBranch.value;
    }

    const response = await axios.post(
      "/api/plugins/install-from-github",
      payload,
    );

    pluginInstallSuccess.value =
      response.data.message || "Plugin installed successfully!";
    pluginRequiresRestart.value = response.data.requires_restart || false;
    pluginBranchSwitched.value = response.data.branch_switched || false;
    pluginActualBranch.value =
      response.data.branch || githubBranch.value || "main";

    // Clear available plugins list
    availablePlugins.value = [];

    // Reload plugins to show the newly installed one (though it won't appear until restart)
    await loadPlugins();

    // Don't auto-clear success message if restart is required
    if (!pluginRequiresRestart.value) {
      setTimeout(() => {
        pluginInstallSuccess.value = "";
      }, 5000);
    }
  } catch (error) {
    // Check for version conflict
    const errorDetail = error.response?.data?.detail || error.message || "";
    if (errorDetail.includes("older than") || errorDetail.includes("version")) {
      // This is a version conflict - could show dialog here if needed
      pluginInstallError.value = errorDetail;
    } else {
      pluginInstallError.value =
        errorDetail || "Failed to install plugin from GitHub";
    }
    console.error("Failed to install plugin from GitHub:", error);
    // Clear error message after 10 seconds
    setTimeout(() => {
      pluginInstallError.value = "";
    }, 10000);
  } finally {
    installingPlugin.value = false;
  }
};

// Theme management functions
const loadThemes = async () => {
  loadingThemes.value = true;
  try {
    // Get themes from plugins API (includes built-in and installed themes)
    // Filter to only themes (type === "theme")
    const response = await axios.get("/api/plugins?plugin_type=theme");
    const allItems = response.data.plugins || [];
    const themePlugins = allItems.filter((p) => p.type === "theme");

    // Also get theme details from themes API for variables/preview
    const themesWithDetails = [];
    for (const themePlugin of themePlugins) {
      try {
        const themeResponse = await axios.get(`/api/plugins/${themePlugin.id}`);
        themesWithDetails.push({
          ...themePlugin,
          ...themeResponse.data,
        });
      } catch (error) {
        // If theme details not found, use plugin data
        themesWithDetails.push(themePlugin);
      }
    }

    themesList.value = themesWithDetails;
  } catch (error) {
    console.error("Failed to load themes:", error);
    themesList.value = [];
  } finally {
    loadingThemes.value = false;
  }
};

// Get theme preview style based on theme variables
const getThemePreviewStyle = (theme) => {
  if (!theme.variables) return {};

  const vars = theme.variables;
  // Create a gradient preview using theme colors
  const bgPrimary = vars["bg-primary"] || "#ffffff";
  const bgSecondary = vars["bg-secondary"] || "#f5f5f5";
  const accentPrimary = vars["accent-primary"] || "#2196f3";

  return {
    background: `linear-gradient(135deg, ${bgPrimary} 0%, ${bgSecondary} 50%, ${accentPrimary} 100%)`,
    color: vars["text-primary"] || "#333333",
  };
};

const selectTheme = async (themeId) => {
  try {
    localConfig.value.selectedTheme = themeId;
    await theme.setSelectedTheme(themeId);
    await configStore.updateConfig({ selectedTheme: themeId });
  } catch (error) {
    console.error("Failed to select theme:", error);
  }
};

const handleThemeZipSelect = async (event) => {
  const file = event.target.files?.[0];
  if (!file) return;

  selectedThemeZip.value = file;
  await installThemeFromZip();
};

const installThemeFromZip = async () => {
  if (!selectedThemeZip.value) return;

  installingTheme.value = true;
  themeInstallError.value = "";
  themeInstallSuccess.value = "";

  try {
    await themesStore.installTheme(selectedThemeZip.value);
    themeInstallSuccess.value = `Theme installed successfully!`;
    selectedThemeZip.value = null;
    await loadThemes();
    setTimeout(() => {
      themeInstallSuccess.value = "";
    }, 5000);
  } catch (error) {
    themeInstallError.value =
      error.response?.data?.detail ||
      error.message ||
      "Failed to install theme";
    setTimeout(() => {
      themeInstallError.value = "";
    }, 10000);
  } finally {
    installingTheme.value = false;
  }
};

const enumerateThemesFromGitHub = async () => {
  if (!themeGithubRepoUrl.value) return;

  enumeratingThemes.value = true;
  availableThemes.value = [];
  themeBranchSwitched.value = false;
  themeActualBranch.value = "";

  try {
    const result = await themesStore.enumerateThemesFromGitHub(
      themeGithubRepoUrl.value,
      themeGithubBranch.value || "main",
    );
    availableThemes.value = result.themes || [];
    themeBranchSwitched.value = result.branch_switched || false;
    themeActualBranch.value =
      result.branch || themeGithubBranch.value || "main";
  } catch (error) {
    console.error("Failed to enumerate themes from GitHub:", error);
    themeInstallError.value =
      error.response?.data?.detail ||
      error.message ||
      "Failed to enumerate themes from GitHub";
    setTimeout(() => {
      themeInstallError.value = "";
    }, 10000);
  } finally {
    enumeratingThemes.value = false;
  }
};

const installThemeFromGitHub = async (themePath) => {
  if (!themeGithubRepoUrl.value || !themePath) return;

  installingTheme.value = true;
  themeInstallError.value = "";
  themeInstallSuccess.value = "";

  try {
    await themesStore.installThemeFromGitHub(
      themeGithubRepoUrl.value,
      themePath,
      themeGithubBranch.value || "main",
    );
    themeInstallSuccess.value = `Theme installed successfully!`;
    await loadThemes();
    setTimeout(() => {
      themeInstallSuccess.value = "";
    }, 5000);
  } catch (error) {
    themeInstallError.value =
      error.response?.data?.detail ||
      error.message ||
      "Failed to install theme";
    setTimeout(() => {
      themeInstallError.value = "";
    }, 10000);
  } finally {
    installingTheme.value = false;
  }
};

const uninstallTheme = async (themeId) => {
  if (!confirm(`Are you sure you want to uninstall theme "${themeId}"?`)) {
    return;
  }

  try {
    await themesStore.uninstallTheme(themeId);
    // If the uninstalled theme was selected, clear selection
    if (localConfig.value.selectedTheme === themeId) {
      localConfig.value.selectedTheme = null;
      await theme.setSelectedTheme(null);
      await configStore.updateConfig({ selectedTheme: null });
    }
    await loadThemes();
  } catch (error) {
    console.error("Failed to uninstall theme:", error);
    themeInstallError.value =
      error.response?.data?.detail ||
      error.message ||
      "Failed to uninstall theme";
    setTimeout(() => {
      themeInstallError.value = "";
    }, 10000);
  }
};

const loadCalendarPluginTypes = async () => {
  try {
    const response = await axios.get("/api/plugins?plugin_type=calendar");
    // Filter to only enabled calendar plugins and map to expected format
    calendarPluginTypes.value = (response.data.plugins || [])
      .filter((p) => p.enabled !== false)
      .map((p) => ({
        id: p.id,
        name: p.name,
        description: p.description,
      }));
    // Set default type if none selected
    if (calendarPluginTypes.value.length > 0 && !newCalendarSource.value.type) {
      newCalendarSource.value.type = calendarPluginTypes.value[0].id;
    }
  } catch (error) {
    console.error("Failed to load calendar plugin types:", error);
    // Fallback to hardcoded types
    calendarPluginTypes.value = [
      { id: "google", name: "Google Calendar" },
      { id: "proton", name: "Proton Calendar" },
    ];
  }
};

const togglePlugin = async (pluginId, enabled) => {
  try {
    await axios.put(`/api/plugins/${pluginId}`, { enabled });
    // Update local state immediately
    const plugin = plugins.value.find((p) => p.id === pluginId);
    if (plugin) {
      plugin.enabled = enabled;
    }

    // If enabling and there are instances, start them all
    if (
      enabled &&
      pluginInstances.value[pluginId] &&
      pluginInstances.value[pluginId].length > 0
    ) {
      const instances = pluginInstances.value[pluginId];
      const promises = instances.map((instance) =>
        startPluginInstance(instance.id),
      );
      await Promise.all(promises);
    }
    // If disabling and there are instances, stop them all
    else if (
      !enabled &&
      pluginInstances.value[pluginId] &&
      pluginInstances.value[pluginId].length > 0
    ) {
      const instances = pluginInstances.value[pluginId];
      const promises = instances.map((instance) =>
        stopPluginInstance(instance.id),
      );
      await Promise.all(promises);
    }

    // Only reload instances for this specific plugin to update running status
    // This avoids reloading the entire plugins list
    try {
      const instancesResponse = await axios.get(
        `/api/plugins/${pluginId}/instances`,
      );
      pluginInstances.value[pluginId] = instancesResponse.data.instances || [];
    } catch (error) {
      console.error(
        `Failed to reload instances for plugin ${pluginId}:`,
        error,
      );
    }

    // Reload calendar sources and types if it's a calendar plugin
    if (plugin && plugin.type === "calendar") {
      await loadCalendarPluginTypes();
      await loadCalendarSources();
    }
  } catch (error) {
    console.error("Failed to toggle plugin:", error);
    alert(
      `Error: ${error.response?.data?.detail || error.message || "Failed to toggle plugin"}`,
    );
  }
};

const togglePluginSettings = (pluginId) => {
  expandedPlugins.value[pluginId] = !expandedPlugins.value[pluginId];
};

// Helper function to get global config schema (only fields marked as global_only)
const getGlobalConfigSchema = (plugin) => {
  if (!plugin || !plugin.config_schema) {
    return {};
  }

  // For service plugins, only show fields marked as global_only
  if (plugin.type === "service") {
    const globalSchema = {};
    for (const [key, schema] of Object.entries(plugin.config_schema)) {
      if (schema.global_only === true) {
        globalSchema[key] = schema;
      }
    }
    return globalSchema;
  }

  // For non-service plugins, show all fields
  return plugin.config_schema;
};

// Helper functions for instance form
const getInstanceFormValue = (key, schema) => {
  const value = instanceForm.value[key];
  if (value !== undefined && value !== null) {
    return value;
  }
  // Fallback to schema default
  return schema?.default ?? "";
};

const updateInstanceFormValue = (key, value) => {
  instanceForm.value[key] = value;
};

const getInstanceFieldLabel = (pluginId, fieldKey) => {
  const plugin = plugins.value.find((p) => p.id === pluginId);
  if (!plugin || !plugin.instance_config_schema) {
    // Fallback: format the key nicely
    return fieldKey.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase());
  }
  const schema = plugin.instance_config_schema[fieldKey];
  if (schema && schema.description) {
    return schema.description;
  }
  // Fallback: format the key nicely
  return fieldKey.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase());
};

const formatInstanceValue = (value, key) => {
  if (typeof value === "boolean") {
    return value ? "Yes" : "No";
  }
  if (typeof value === "number") {
    return String(value);
  }
  if (typeof value === "object" && value !== null) {
    if (typeof value.toString === "function") {
      return value.toString();
    }
    if (value.path) {
      return String(value.path);
    }
    return JSON.stringify(value);
  }
  // Truncate long strings
  const str = String(value);
  if (str.length > 50) {
    return str.substring(0, 47) + "...";
  }
  return str;
};

const getInstanceSummary = (pluginId, config) => {
  if (!config || Object.keys(config).length === 0) {
    return null;
  }

  const plugin = plugins.value.find((p) => p.id === pluginId);
  const schema = plugin?.instance_config_schema || {};

  // Priority order: configured URLs (not internal API endpoints), name, title
  // Exclude internal API URLs that start with /api/
  const priorityKeys = [
    "mealie_url",
    "url",
    "api_url",
    "endpoint",
    "base_url",
    "server_url",
    "host",
    "name",
    "title",
  ];

  // Try to find a priority key first (excluding internal API URLs)
  for (const key of priorityKeys) {
    const value = config[key];
    if (
      value !== null &&
      value !== undefined &&
      value !== "" &&
      typeof value === "string" &&
      !value.startsWith("/api/") && // Exclude internal API endpoints
      !value.includes("/api/web-services/") // Exclude internal service endpoints
    ) {
      return formatInstanceValue(value, key);
    }
  }

  // Otherwise, find the first non-sensitive string value (excluding internal URLs)
  for (const [key, value] of Object.entries(config)) {
    if (
      value !== null &&
      value !== undefined &&
      value !== "" &&
      typeof value === "string" &&
      !value.startsWith("/api/") && // Exclude internal API endpoints
      !value.includes("/api/web-services/") && // Exclude internal service endpoints
      !["api_token", "api_key", "password", "token", "enabled"].some((s) =>
        key.toLowerCase().includes(s),
      )
    ) {
      return formatInstanceValue(value, key);
    }
  }

  return null;
};

// Instance management functions
const openAddInstanceModal = (pluginId) => {
  const plugin = plugins.value.find((p) => p.id === pluginId);
  if (!plugin) return;

  logDebug(
    "[Settings]",
    `Opening add instance modal for ${pluginId}`,
    "instance_config_schema:",
    plugin.instance_config_schema,
  );

  currentPluginType.value = plugin;
  editingInstance.value = null;

  // Initialize form with defaults from instance_config_schema
  const form = {
    name: "",
    enabled: true,
  };

  if (plugin.instance_config_schema) {
    for (const [key, schema] of Object.entries(plugin.instance_config_schema)) {
      if (schema.default !== undefined) {
        form[key] = schema.default;
      } else if (schema.type === "boolean") {
        form[key] = false;
      } else {
        form[key] = "";
      }
    }
  } else {
    logWarn(
      "[Settings]",
      `Plugin ${pluginId} does not have instance_config_schema`,
    );
  }

  logDebug("[Settings]", "Initialized instance form:", form);
  instanceForm.value = form;
  instanceFormError.value = "";
  showInstanceModal.value = true;
};

const openEditInstanceModal = (pluginId, instance) => {
  const plugin = plugins.value.find((p) => p.id === pluginId);
  if (!plugin) return;

  currentPluginType.value = plugin;
  editingInstance.value = instance;

  // Initialize form from instance config, using schema defaults as fallback
  const form = {
    name: instance.name || "",
    enabled: instance.enabled !== undefined ? instance.enabled : true,
  };

  if (plugin.instance_config_schema) {
    for (const [key, schema] of Object.entries(plugin.instance_config_schema)) {
      form[key] =
        instance.config?.[key] !== undefined
          ? instance.config[key]
          : schema.default !== undefined
            ? schema.default
            : schema.type === "boolean"
              ? false
              : "";
    }
  }

  instanceForm.value = form;
  instanceFormError.value = "";
  showInstanceModal.value = true;
};

const closeInstanceModal = () => {
  showInstanceModal.value = false;
  editingInstance.value = null;
  currentPluginType.value = null;
  instanceFormError.value = "";
  testingInstance.value = false;
  instanceTestStatus.value = null;
};

const testInstanceConnection = async () => {
  testingInstance.value = true;
  instanceTestStatus.value = null;
  instanceFormError.value = "";

  try {
    const pluginId = currentPluginType.value.id;
    const plugin = currentPluginType.value;

    // Build test config from instance form data
    const testConfig = {};
    if (plugin.instance_config_schema) {
      for (const [key, schema] of Object.entries(
        plugin.instance_config_schema,
      )) {
        // Skip display_order - it's a global plugin setting
        if (key === "display_order") {
          continue;
        }
        const value = instanceForm.value[key];
        if (value !== undefined && value !== null) {
          // Handle different types
          if (schema.type === "string" && typeof value === "string") {
            testConfig[key] = value.trim();
          } else if (schema.type === "integer" || schema.type === "number") {
            testConfig[key] = Number(value) || schema.default || 0;
          } else if (schema.type === "boolean") {
            testConfig[key] = Boolean(value);
          } else {
            testConfig[key] = value;
          }
        } else if (schema.default !== undefined) {
          testConfig[key] = schema.default;
        }
      }
    }

    // Also include common_config_schema values if needed
    if (plugin.config_schema) {
      for (const [key, schema] of Object.entries(plugin.config_schema)) {
        // Get from saved plugin config if available
        const savedValue = pluginConfigs.value[pluginId]?.[key];
        if (savedValue !== undefined && savedValue !== null) {
          testConfig[key] = savedValue;
        } else if (schema.default !== undefined) {
          testConfig[key] = schema.default;
        }
      }
    }

    // Test connection with instance config
    const response = await axios.post(
      `/api/plugins/${pluginId}/test`,
      testConfig,
    );

    instanceTestStatus.value = {
      success: response.data.success,
      message: response.data.message,
    };

    // Clear test status after 5 seconds
    setTimeout(() => {
      if (instanceTestStatus.value) {
        instanceTestStatus.value = null;
      }
    }, 5000);
  } catch (error) {
    console.error("Failed to test instance connection:", error);
    instanceTestStatus.value = {
      success: false,
      message:
        error.response?.data?.detail ||
        error.message ||
        "Failed to test connection",
    };
  } finally {
    testingInstance.value = false;
  }
};

const saveInstance = async () => {
  savingInstance.value = true;
  instanceFormError.value = "";

  try {
    const pluginId = currentPluginType.value.id;
    const plugin = currentPluginType.value;

    // Build config from instance_config_schema fields
    // Exclude display_order - it's a global plugin setting, not instance-specific
    const config = {};
    if (plugin.instance_config_schema) {
      for (const [key, schema] of Object.entries(
        plugin.instance_config_schema,
      )) {
        // Skip display_order - it's handled at the plugin level
        if (key === "display_order") {
          continue;
        }
        const value = instanceForm.value[key];
        if (value !== undefined && value !== null) {
          // Handle different types
          if (schema.type === "string" && typeof value === "string") {
            config[key] = value.trim();
          } else if (schema.type === "integer" || schema.type === "number") {
            config[key] = Number(value) || schema.default || 0;
          } else if (schema.type === "boolean") {
            config[key] = Boolean(value);
          } else {
            config[key] = value;
          }
        } else if (schema.default !== undefined) {
          config[key] = schema.default;
        }
      }
    }

    config.enabled = instanceForm.value.enabled;

    if (editingInstance.value) {
      // Update existing instance
      // Try web services API first (works for iframe and other service plugins)
      try {
        await axios.put(`/api/web-services/${editingInstance.value.id}`, {
          name: instanceForm.value.name.trim(),
          ...config,
        });
      } catch (webServiceError) {
        // If web service update fails, try plugin API
        // This might be needed for plugins that don't use web services API
        throw webServiceError;
      }
    } else {
      // Create new instance
      // Try web services API first (works for iframe)
      try {
        await axios.post("/api/web-services", {
          name: instanceForm.value.name.trim(),
          ...config,
          enabled: config.enabled,
        });
      } catch (webServiceError) {
        // If web services API fails, use plugin config update to trigger instance creation
        // This will call handle_plugin_config_update hook
        await axios.put(`/api/plugins/${pluginId}`, {
          ...config,
          enabled: config.enabled,
        });
      }
    }

    // Reload instances
    await loadPlugins();
    closeInstanceModal();
  } catch (error) {
    console.error("Failed to save instance:", error);
    instanceFormError.value =
      error.response?.data?.detail ||
      error.message ||
      "Failed to save instance";
  } finally {
    savingInstance.value = false;
  }
};

const deletePluginInstance = async (instanceId) => {
  if (!confirm("Are you sure you want to delete this instance?")) {
    return;
  }

  try {
    // Try web services API first (for iframe instances)
    try {
      await axios.delete(`/api/web-services/${instanceId}`);
      // Reload instances
      await loadPlugins();
      return;
    } catch (webServiceError) {
      // If web services API fails with 404, it's not an iframe service
      // Try to delete via plugin registry (which handles all plugin types)
      if (webServiceError.response?.status === 404) {
        // For non-iframe plugins, we need to use the plugin registry unregister
        // which is called by web services API internally, but we can also call it directly
        // Actually, web services API should handle all service plugins
        // Let's check if there's a generic plugin instance delete endpoint
        console.warn(
          `Web services API returned 404 for ${instanceId}, instance may not exist or may have already been deleted`,
        );
        // Still reload to refresh the UI
        await loadPlugins();
        return;
      }
      // For other errors, throw them
      throw webServiceError;
    }
  } catch (error) {
    console.error("Failed to delete instance:", error);
    alert(
      `Failed to delete instance: ${error.response?.data?.detail || error.message || "Unknown error"}`,
    );
  }
};

const togglePluginInstance = async (instanceId, enabled) => {
  try {
    // Try web services API first (for iframe instances)
    try {
      await axios.put(`/api/web-services/${instanceId}`, { enabled });
    } catch (webServiceError) {
      // If not found in web services, we need plugin instance update endpoint
      // For now, this will only work for iframe instances
      throw webServiceError;
    }

    // If enabling, start the instance; if disabling, stop it
    if (enabled) {
      try {
        await startPluginInstance(instanceId);
      } catch (startError) {
        // If start fails, that's okay - instance is enabled but not running
        console.warn("Failed to start instance after enabling:", startError);
      }
    } else {
      try {
        await stopPluginInstance(instanceId);
      } catch (stopError) {
        // If stop fails, that's okay - instance is disabled
        console.warn("Failed to stop instance after disabling:", stopError);
      }
    }

    // Reload instances
    await loadPlugins();
  } catch (error) {
    console.error("Failed to toggle instance:", error);
    alert(
      `Failed to toggle instance: ${error.response?.data?.detail || error.message || "Unknown error"}`,
    );
  }
};

const getConfigValue = (pluginId, key, schema) => {
  const config = pluginConfigs.value[pluginId];
  if (config && config[key] !== undefined && config[key] !== null) {
    const value = config[key];
    // Ensure value is a string, not an object
    if (typeof value === "string") {
      return value;
    } else if (typeof value === "object" && value !== null) {
      // If it's an object, try to extract the actual value
      console.warn(`Config value for ${pluginId}.${key} is an object:`, value);
      // Try to extract value from object (could be schema object with value/default)
      return value.value || value.default || "";
    }
    return String(value);
  }
  // Fallback to schema default
  if (schema && typeof schema === "object" && schema.default !== undefined) {
    return String(schema.default || "");
  }
  return "";
};

const getFormValue = (pluginId, key, schema) => {
  // Use form data if available, otherwise use saved config
  // This allows plugins to track form state separately from saved config
  if (
    pluginFormData.value[pluginId] &&
    pluginFormData.value[pluginId][key] !== undefined
  ) {
    const value = pluginFormData.value[pluginId][key];
    // Ensure value is a string, not an object
    if (typeof value === "string") {
      return value;
    } else if (typeof value === "object" && value !== null) {
      // If it's an object, try to extract the actual value
      return value.value || value.default || "";
    }
    // For numbers, convert to string (PluginFieldRenderer expects strings)
    if (typeof value === "number") {
      return String(value);
    }
    return String(value);
  }
  return getConfigValue(pluginId, key, schema);
};

const updateFormValue = (pluginId, key, value) => {
  // Store form data for IMAP plugin
  if (!pluginFormData.value[pluginId]) {
    pluginFormData.value[pluginId] = {};
  }
  pluginFormData.value[pluginId][key] = value;
  // Clear save status when form changes
  if (pluginSaveStatus.value[pluginId]) {
    delete pluginSaveStatus.value[pluginId];
  }
};

const savePluginConfig = async (pluginId) => {
  savingPlugin.value = pluginId;
  pluginSaveStatus.value[pluginId] = null;
  pluginTestStatus.value[pluginId] = null;

  try {
    // Get form data or use current config
    const formData = pluginFormData.value[pluginId] || {};
    const currentConfig = pluginConfigs.value[pluginId] || {};
    const updatedConfig = { ...currentConfig, ...formData };

    // Debug logging
    logDebug(
      "[Settings]",
      `Saving plugin config for ${pluginId}:`,
      updatedConfig,
    );
    logDebug("[Settings]", "Form data:", formData);
    logDebug("[Settings]", "Current config:", currentConfig);

    // Ensure all values are strings, not objects
    const cleanedConfig = {};
    for (const [key, value] of Object.entries(updatedConfig)) {
      if (value === null || value === undefined) {
        cleanedConfig[key] = "";
      } else if (typeof value === "object") {
        // If it's an object, try to extract the actual value
        logWarn("[Settings]", `Found object value for ${key}:`, value);
        cleanedConfig[key] = value.value || value.default || "";
      } else {
        cleanedConfig[key] = String(value);
      }
    }
    logDebug("[Settings]", "Cleaned config:", cleanedConfig);

    await axios.put(`/api/plugins/${pluginId}`, cleanedConfig);

    // Update local config with cleaned config
    pluginConfigs.value[pluginId] = cleanedConfig;
    // Clear form data after successful save
    if (pluginFormData.value[pluginId]) {
      delete pluginFormData.value[pluginId];
    }

    // Show success message
    pluginSaveStatus.value[pluginId] = {
      success: true,
      message: "Settings saved successfully!",
    };

    // Clear success message after 3 seconds
    setTimeout(() => {
      if (
        pluginSaveStatus.value[pluginId] &&
        pluginSaveStatus.value[pluginId].success
      ) {
        delete pluginSaveStatus.value[pluginId];
      }
    }, 3000);

    // Reload relevant data based on plugin type
    const plugin = plugins.value.find((p) => p.id === pluginId);
    if (plugin) {
      if (plugin.type === "calendar") {
        await loadCalendarSources();
      } else if (plugin.type === "image") {
        // Reload images when image plugin config is updated
        await loadImages();
      }
    }
  } catch (error) {
    console.error("Failed to save plugin config:", error);
    pluginSaveStatus.value[pluginId] = {
      success: false,
      message:
        error.response?.data?.detail ||
        error.message ||
        "Failed to save settings",
    };
  } finally {
    savingPlugin.value = null;
  }
};

const testPluginConnection = async (pluginId) => {
  testingPlugin.value[pluginId] = true;
  pluginTestStatus.value[pluginId] = null;

  try {
    // Get current form data or saved config
    const formData = pluginFormData.value[pluginId] || {};
    const currentConfig = pluginConfigs.value[pluginId] || {};
    const testConfig = { ...currentConfig, ...formData };

    // Save config first if there are unsaved changes
    if (Object.keys(formData).length > 0) {
      await axios.put(`/api/plugins/${pluginId}`, testConfig);
      pluginConfigs.value[pluginId] = testConfig;
      delete pluginFormData.value[pluginId];
    }

    // Test connection
    const response = await axios.post(`/api/plugins/${pluginId}/test`);

    pluginTestStatus.value[pluginId] = {
      success: response.data.success,
      message: response.data.message,
    };

    // Clear test status after 5 seconds
    setTimeout(() => {
      if (pluginTestStatus.value[pluginId]) {
        delete pluginTestStatus.value[pluginId];
      }
    }, 5000);
  } catch (error) {
    console.error("Failed to test plugin connection:", error);
    pluginTestStatus.value[pluginId] = {
      success: false,
      message:
        error.response?.data?.detail ||
        error.message ||
        "Failed to test connection",
    };
  } finally {
    testingPlugin.value[pluginId] = false;
  }
};

const handleCustomAction = async (action) => {
  logDebug("[Settings]", "handleCustomAction called with:", action);

  const pluginId = action.pluginId;
  const endpoint = action.endpoint;

  if (!pluginId || !endpoint) {
    logError(
      "[Settings]",
      "Custom action missing pluginId or endpoint:",
      action,
    );
    pluginTestStatus.value[pluginId || "unknown"] = {
      success: false,
      message: "Action configuration error: missing plugin ID or endpoint",
    };
    return;
  }

  // Extract action path from endpoint (e.g., "geocode" from "/api/plugins/{plugin_id}/geocode")
  const actionPath = endpoint.split("/").pop();
  logDebug("[Settings]", "Action path:", actionPath, "Plugin ID:", pluginId);

  // Get form data for this plugin
  const formData = pluginFormData.value[pluginId] || {};
  logDebug("[Settings]", "Form data for plugin:", formData);
  logDebug("[Settings]", "All pluginFormData:", pluginFormData.value);

  try {
    if (actionPath === "geocode") {
      // Geocode action - get location from form data
      // Try to get from formData first, then from current config as fallback
      let location = formData.location || "";

      // If not in formData, try to get from current plugin config
      if (!location && pluginConfigs.value[pluginId]) {
        const config = pluginConfigs.value[pluginId];
        location = config.location || "";
        logDebug("[Settings]", "Got location from plugin config:", location);
      }

      logDebug("[Settings]", "Location from form:", location);

      if (!location || location.trim() === "") {
        pluginTestStatus.value[pluginId] = {
          success: false,
          message:
            "Please enter a location name in the 'Location' field above first",
        };
        return;
      }

      // Call geocode endpoint (replace {plugin_id} placeholder)
      const actualEndpoint = endpoint.replace("{plugin_id}", pluginId);
      logDebug(
        "[Settings]",
        "Calling geocode endpoint:",
        actualEndpoint,
        "with location:",
        location,
      );
      const response = await axios.post(actualEndpoint, { location });

      const result = response.data;

      if (result.success) {
        // Update form data with coordinates and display name
        if (!pluginFormData.value[pluginId]) {
          pluginFormData.value[pluginId] = {};
        }

        // Update coordinates - use updateFormValue to ensure reactivity
        updateFormValue(pluginId, "latitude", result.latitude);
        updateFormValue(pluginId, "longitude", result.longitude);

        // Update location field with the geocoded display name for better UX
        if (result.display_name) {
          updateFormValue(pluginId, "location", result.display_name);
        }

        // Show success message
        pluginTestStatus.value[pluginId] = {
          success: true,
          message:
            result.message ||
            `Coordinates found: ${result.latitude}, ${result.longitude}`,
        };

        // Clear message after 5 seconds
        setTimeout(() => {
          pluginTestStatus.value[pluginId] = null;
        }, 5000);
      } else {
        pluginTestStatus.value[pluginId] = {
          success: false,
          message: result.message || "Failed to geocode location",
        };
      }
    } else {
      console.warn("Unknown custom action:", actionPath);
    }
  } catch (error) {
    pluginTestStatus.value[pluginId] = {
      success: false,
      message:
        error.response?.data?.detail ||
        error.message ||
        "Error performing action",
    };
  }
};

const fetchPluginNow = async (pluginId) => {
  fetchingPlugin.value[pluginId] = true;
  pluginFetchStatus.value[pluginId] = null;

  try {
    // Fetch now
    const response = await axios.post(`/api/plugins/${pluginId}/fetch`);

    const result = response.data;
    let message = result.message;

    // Add image count info if available
    if (result.images_downloaded && result.image_count !== undefined) {
      message += ` (${result.image_count} images available)`;
    } else if (result.image_count !== undefined) {
      message += ` (${result.image_count} images available)`;
    }

    pluginFetchStatus.value[pluginId] = {
      success: result.success,
      message: message,
      images_downloaded: result.images_downloaded || false,
      image_count: result.image_count || 0,
    };

    // Reload images if any were downloaded
    if (result.images_downloaded) {
      await loadImages();
    }

    // Clear fetch status after 5 seconds
    setTimeout(() => {
      if (pluginFetchStatus.value[pluginId]) {
        delete pluginFetchStatus.value[pluginId];
      }
    }, 5000);
  } catch (error) {
    console.error("Failed to fetch plugin:", error);
    pluginFetchStatus.value[pluginId] = {
      success: false,
      message:
        error.response?.data?.detail ||
        error.message ||
        "Failed to fetch emails",
      images_downloaded: false,
      image_count: 0,
    };
  } finally {
    fetchingPlugin.value[pluginId] = false;
  }
};

const getCalendarTypePlaceholder = (type) => {
  const typeInfo = calendarPluginTypes.value.find((t) => t.id === type);
  if (typeInfo) {
    if (type === "google") {
      return "https://calendar.google.com/calendar/u/0?cid=...";
    } else if (type === "proton") {
      return "https://calendar.proton.me/api/calendar/v1/url/.../calendar.ics?CacheKey=...&PassphraseKey=...";
    } else {
      return "https://example.com/calendar.ics";
    }
  }
  return "Calendar iCal URL";
};

const getCalendarTypeHelpText = (type) => {
  const typeInfo = calendarPluginTypes.value.find((t) => t.id === type);
  if (typeInfo) {
    if (type === "google") {
      return "Google Calendar: Share link or iCal URL from Google Calendar settings";
    } else if (type === "proton") {
      return "Proton Calendar: iCal feed URL from Proton Calendar sharing settings (includes CacheKey and PassphraseKey)";
    } else {
      return typeInfo.description || "iCal feed URL";
    }
  }
  return "Calendar iCal URL";
};

onMounted(async () => {
  await loadThemes();
  await loadConfig();
  await loadKeyboardMappings();
  await loadCalendarPluginTypes();
  await loadCalendarSources();
  await loadImages();
  await loadPlugins();

  // Close system menu when clicking outside
  document.addEventListener("click", (e) => {
    const menu = document.querySelector(".system-menu");
    if (menu && !menu.contains(e.target)) {
      showSystemMenu.value = false;
    }
  });
});
</script>

<style scoped>
.settings-page {
  width: 100%;
  min-height: 100vh;
  background: var(--bg-secondary);
  padding: 2rem;
}

.settings-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 2rem;
  padding: 1.5rem;
  background: var(--bg-primary);
  border-radius: 8px;
  box-shadow: 0 2px 4px var(--shadow);
}

.settings-header h1 {
  margin: 0;
  font-size: 2rem;
  color: var(--text-primary);
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 1rem;
}

.system-menu {
  position: relative;
}

.btn-system-menu {
  background: var(--bg-secondary);
  color: var(--text-primary);
  border: 1px solid var(--border-color);
  border-radius: 4px;
  padding: 0.5rem 1rem;
  font-size: 0.9rem;
  cursor: pointer;
  transition: all 0.2s;
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.btn-system-menu:hover {
  background: var(--bg-tertiary);
}

.menu-arrow {
  font-size: 0.75rem;
  margin-left: 0.25rem;
}

.system-menu-dropdown {
  position: absolute;
  top: 100%;
  right: 0;
  margin-top: 0.5rem;
  background: var(--bg-primary);
  border: 1px solid var(--border-color);
  border-radius: 4px;
  box-shadow: 0 4px 8px rgba(0, 0, 0, 0.15);
  z-index: 1000;
  min-width: 180px;
  overflow: hidden;
}

.system-menu-dropdown .menu-item {
  display: block;
  width: 100%;
  padding: 0.75rem 1rem;
  background: transparent;
  border: none;
  text-align: left;
  color: var(--text-primary);
  font-size: 0.9rem;
  cursor: pointer;
  transition: background 0.2s;
}

.system-menu-dropdown .menu-item:hover {
  background: var(--bg-secondary);
}

.btn-back {
  background: var(--text-secondary);
  color: #fff; /* Keep white for contrast on secondary background */
  border: none;
  border-radius: 4px;
  padding: 0.75rem 1.5rem;
  font-size: 1rem;
  cursor: pointer;
  transition: background 0.2s;
}

.btn-back:hover {
  background: var(--text-primary);
}

.settings-layout {
  display: grid;
  grid-template-columns: 250px 1fr;
  gap: 2rem;
  max-width: 1400px;
  margin: 0 auto;
}

.settings-sidebar {
  background: var(--bg-primary);
  border-radius: 8px;
  padding: 1rem;
  box-shadow: 0 2px 4px var(--shadow);
  height: fit-content;
  position: sticky;
  top: 2rem;
}

.category-nav {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.category-btn {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.875rem 1rem;
  background: transparent;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s;
  text-align: left;
  color: var(--text-primary);
  font-size: 1rem;
  font-weight: 500;
}

.category-btn:hover {
  background: var(--bg-secondary);
}

.category-btn.active {
  background: var(--accent-primary);
  color: #fff;
  font-weight: 600;
  box-shadow: 0 2px 4px rgba(33, 150, 243, 0.3);
}

.category-icon {
  font-size: 1.25rem;
  line-height: 1;
}

.category-label {
  flex: 1;
}

.settings-content {
  display: flex;
  flex-direction: column;
  gap: 2rem;
  min-width: 0; /* Prevent grid overflow */
}

.settings-actions {
  max-width: 1400px;
  margin: 2rem auto 0;
  padding: 0 2rem;
}

.settings-section {
  background: var(--bg-primary);
  border-radius: 8px;
  padding: 2rem;
  box-shadow: 0 2px 4px var(--shadow);
}

.settings-section.collapsible {
  padding: 0;
  overflow: hidden;
}

.settings-section.collapsible .section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1.5rem 2rem;
  cursor: pointer;
  user-select: none;
  transition: background 0.2s;
  border-bottom: 2px solid var(--border-color);
}

.settings-section.collapsible .section-header:hover {
  background: var(--bg-secondary);
}

.settings-section.collapsible .section-header h2 {
  margin: 0;
  font-size: 1.5rem;
  color: var(--text-primary);
  border-bottom: none;
  padding-bottom: 0;
}

.settings-section.collapsible .toggle-icon {
  font-size: 1rem;
  color: var(--text-secondary);
  transition: transform 0.2s;
  margin-left: 1rem;
}

.settings-section.collapsible.expanded .toggle-icon {
  transform: rotate(0deg);
}

.settings-section.collapsible .section-content {
  padding: 1.5rem 2rem;
  animation: slideDown 0.2s ease-out;
}

@keyframes slideDown {
  from {
    opacity: 0;
    max-height: 0;
  }
  to {
    opacity: 1;
    max-height: 2000px;
  }
}

.settings-section h2 {
  margin: 0 0 1.5rem 0;
  font-size: 1.5rem;
  color: var(--text-primary);
  border-bottom: 2px solid var(--border-color);
  padding-bottom: 0.5rem;
}

.settings-section h3 {
  margin: 1.5rem 0 1rem 0;
  font-size: 1.2rem;
  color: var(--text-secondary);
}

.setting-item {
  margin-bottom: 1.5rem;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.setting-item label {
  font-weight: 600;
  color: var(--text-primary);
  font-size: 1rem;
}

.setting-item input[type="number"],
.setting-item select {
  padding: 0.5rem;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  font-size: 1rem;
  max-width: 200px;
  background: var(--bg-primary);
  color: var(--text-primary);
}

.help-text {
  font-size: 0.85rem;
  color: var(--text-secondary);
  font-style: italic;
}

.schedule-days {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  margin-top: 0.5rem;
}

.schedule-day {
  padding: 0.75rem;
  background: var(--bg-tertiary);
  border-radius: 4px;
  border: 1px solid var(--border-color);
}

.schedule-day-header {
  margin-bottom: 0.5rem;
}

.schedule-day-header label {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-weight: 600;
  color: var(--text-primary);
  cursor: pointer;
}

.schedule-day-times {
  display: flex;
  gap: 1rem;
  flex-wrap: wrap;
  margin-top: 0.5rem;
}

.schedule-time {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.schedule-time label {
  font-size: 0.9rem;
  color: var(--text-secondary);
  min-width: 40px;
}

.schedule-time input[type="time"] {
  padding: 0.5rem;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  font-size: 0.9rem;
  background: var(--bg-primary);
  color: var(--text-primary);
}

.keyboard-mappings {
  margin-top: 2rem;
}

.mappings-list {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.mapping-item {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 1rem;
  background: var(--bg-tertiary);
  border-radius: 4px;
  border: 1px solid var(--border-color);
}

.mapping-key {
  min-width: 150px;
  font-size: 1rem;
  color: var(--text-primary);
}

.mapping-action {
  flex: 1;
  padding: 0.5rem;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  font-size: 1rem;
  background: var(--bg-primary);
  color: var(--text-primary);
}

.btn-clear {
  background: var(--accent-error);
  color: #fff; /* Keep white for contrast on error background */
  border: none;
  border-radius: 4px;
  width: 32px;
  height: 32px;
  font-size: 1.5rem;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.2s;
}

.btn-clear:hover {
  background: var(--accent-error);
  opacity: 0.9;
}

.add-calendar-form {
  margin-bottom: 2rem;
  padding: 1.5rem;
  background: var(--bg-tertiary);
  border-radius: 4px;
  border: 1px solid var(--border-color);
}

.add-calendar-form h3 {
  margin: 0 0 1rem 0;
  font-size: 1.2rem;
  color: var(--text-primary);
}

.form-group {
  margin-bottom: 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.form-group label {
  font-weight: 600;
  color: var(--text-primary);
  font-size: 0.9rem;
}

.form-input,
.form-select {
  padding: 0.75rem;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  font-size: 1rem;
  width: 100%;
  max-width: 600px;
  background: var(--bg-primary);
  color: var(--text-primary);
}

.form-input:focus,
.form-select:focus {
  outline: 2px solid var(--accent-primary);
  outline-offset: 2px;
  border-color: var(--accent-primary);
}

.btn-add {
  background: var(--accent-secondary);
  color: #fff; /* Keep white for contrast on accent background */
  border: none;
  border-radius: 4px;
  padding: 0.75rem 1.5rem;
  font-size: 1rem;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.2s;
  margin-top: 0.5rem;
}

.btn-add:hover:not(:disabled) {
  background: var(--accent-secondary);
  opacity: 0.9;
}

.btn-add:disabled {
  background: var(--text-tertiary);
  cursor: not-allowed;
  opacity: 0.6;
}

.add-web-service-form {
  margin-bottom: 2rem;
  padding: 1.5rem;
  background: var(--bg-tertiary);
  border-radius: 4px;
  border: 1px solid var(--border-color);
}

.add-web-service-form h3 {
  margin: 0 0 1rem 0;
  font-size: 1.2rem;
  color: var(--text-primary);
}

.web-services-list {
  margin-top: 2rem;
}

.web-services-list h3 {
  margin: 0 0 1rem 0;
  font-size: 1.1rem;
  color: var(--text-primary);
}

.empty-state {
  padding: 2rem;
  text-align: center;
  color: var(--text-tertiary);
  background: var(--bg-tertiary);
  border-radius: 4px;
  border: 1px dashed var(--border-color);
}

.services-list {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.service-item {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  padding: 1rem;
  background: var(--bg-tertiary);
  border-radius: 4px;
  border: 1px solid var(--border-color);
  gap: 1rem;
}

.service-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.service-header {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.service-header h4 {
  margin: 0;
  font-size: 1.1rem;
  color: var(--text-primary);
}

.service-url-display {
  font-family: monospace;
  font-size: 0.85rem;
  color: var(--text-secondary);
  word-break: break-all;
}

.service-settings {
  display: flex;
  gap: 1.5rem;
  flex-wrap: wrap;
}

.service-setting {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.service-setting label {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.9rem;
  color: var(--text-secondary);
}

.order-input {
  width: 60px;
  padding: 0.25rem 0.5rem;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  font-size: 0.9rem;
  background: var(--bg-primary);
  color: var(--text-primary);
}

.service-actions {
  display: flex;
  align-items: center;
  gap: 1rem;
  flex-shrink: 0;
}

.calendar-sources-list {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  margin-top: 1rem;
}

.source-item {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  padding: 1rem;
  background: var(--bg-tertiary);
  border-radius: 4px;
  border: 1px solid var(--border-color);
}

.source-settings {
  display: flex;
  gap: 1rem;
  align-items: center;
  flex-wrap: wrap;
}

.source-setting {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.color-input {
  width: 40px;
  height: 30px;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  cursor: pointer;
}

.source-info {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.source-info strong {
  font-size: 1rem;
  color: var(--text-primary);
}

.source-type {
  font-size: 0.85rem;
  color: var(--text-secondary);
  text-transform: capitalize;
}

.running-indicator {
  font-size: 0.9rem;
  margin-left: 0.5rem;
  display: inline-block;
}

.running-indicator.running {
  color: #4caf50; /* Green for running */
}

.running-indicator.stopped {
  color: #f44336; /* Red for stopped */
}

.source-actions {
  display: flex;
  align-items: center;
  gap: 1rem;
}

.toggle-switch {
  position: relative;
  display: inline-block;
  width: 50px;
  height: 24px;
}

.toggle-switch input {
  opacity: 0;
  width: 0;
  height: 0;
}

.slider {
  position: absolute;
  cursor: pointer;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: var(--text-tertiary);
  transition: 0.4s;
  border-radius: 24px;
}

.slider:before {
  position: absolute;
  content: "";
  height: 18px;
  width: 18px;
  left: 3px;
  bottom: 3px;
  background-color: var(--bg-primary);
  transition: 0.4s;
  border-radius: 50%;
}

input:checked + .slider {
  background-color: var(--accent-secondary);
}

input:checked + .slider:before {
  transform: translateX(26px);
}

.button-group {
  display: flex;
  gap: 0.5rem;
  margin-top: 0.5rem;
}

.btn-primary {
  background: var(--accent-secondary);
  color: #fff;
  border: none;
  border-radius: 4px;
  padding: 0.75rem 1.5rem;
  cursor: pointer;
  font-size: 0.9rem;
  font-weight: 500;
  transition: all 0.2s;
}

.btn-primary:hover:not(:disabled) {
  opacity: 0.9;
  transform: translateY(-1px);
}

.btn-primary:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.btn-secondary {
  background: var(--bg-tertiary);
  color: var(--text-primary);
  border: 1px solid var(--border-color);
  border-radius: 4px;
  padding: 0.75rem 1.5rem;
  cursor: pointer;
  font-size: 0.9rem;
  transition: all 0.2s;
}

.btn-secondary:hover:not(:disabled) {
  background: var(--bg-secondary);
  border-color: var(--accent-primary);
}

.btn-secondary:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.btn-remove {
  background: var(--accent-error);
  color: #fff; /* Keep white for contrast on error background */
  border: none;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.btn-remove:hover {
  background: var(--accent-error);
  opacity: 0.9;
  transform: translateY(-1px);
}

.btn-stop {
  background: #f44336; /* Red for stop button */
  color: #fff;
}

.btn-stop:hover {
  background: #d32f2f;
  opacity: 0.9;
}

.actions-list {
  display: flex;
  flex-direction: column;
  gap: 2rem;
}

.action-group {
  padding: 1.5rem;
  background: var(--bg-secondary);
  border-radius: 8px;
  border: 1px solid var(--border-color);
}

.action-group-title {
  font-size: 1rem;
  font-weight: 600;
  margin: 0 0 1rem 0;
  color: var(--text-primary);
}

.action-buttons {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
  margin-bottom: 0.75rem;
}

.action-group-description {
  font-size: 0.875rem;
  color: var(--text-secondary);
  line-height: 1.6;
  margin: 0;
}

.btn-save {
  background: var(--accent-secondary);
  color: #fff; /* Keep white for contrast on accent background */
  border: none;
  border-radius: 4px;
  padding: 0.75rem 2rem;
  font-size: 1rem;
  cursor: pointer;
  transition: background 0.2s;
}

.btn-save:hover {
  background: var(--accent-secondary);
  opacity: 0.9;
}

.btn-reset {
  background: var(--accent-warning);
  color: #fff; /* Keep white for contrast on warning background */
  border: none;
  border-radius: 4px;
  padding: 0.75rem 2rem;
  font-size: 1rem;
  cursor: pointer;
  transition: background 0.2s;
}

.btn-reset:hover {
  background: var(--accent-warning);
  opacity: 0.9;
}

.btn-update {
  background: var(--accent-primary);
  color: #fff;
  border: none;
  border-radius: 4px;
  padding: 0.75rem 2rem;
  font-size: 1rem;
  cursor: pointer;
  transition: background 0.2s;
}

.btn-update:hover:not(:disabled) {
  background: var(--accent-primary);
  opacity: 0.9;
}

.btn-update:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.btn-reload {
  background: var(--accent-info, #17a2b8);
  color: #fff;
  border: none;
  border-radius: 4px;
  padding: 0.75rem 2rem;
  font-size: 1rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
}

.btn-reload:hover {
  background: var(--accent-info, #17a2b8);
  opacity: 0.9;
}

.btn-restart {
  padding: 0.75rem 1.5rem;
  background: #ff9800;
  color: #fff;
  border: none;
  border-radius: 4px;
  font-size: 1rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-restart:hover {
  background: #f57c00;
  opacity: 0.9;
}

.restart-actions {
  margin-top: 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.restart-alternative {
  font-size: 0.8125rem;
  color: var(--text-secondary);
  font-style: italic;
}

.restart-alternative code {
  background: var(--bg-primary);
  padding: 0.25rem 0.5rem;
  border-radius: 3px;
  font-family: monospace;
  font-size: 0.875rem;
}

.update-message {
  margin-top: 1rem;
  padding: 0.75rem 1rem;
  border-radius: 4px;
  font-size: 0.9rem;
  white-space: pre-wrap;
  word-wrap: break-word;
  max-height: 300px;
  overflow-y: auto;
  font-family: "Courier New", monospace;
  font-size: 0.85rem;
  line-height: 1.4;
}

.update-message.info {
  background: var(--bg-tertiary);
  color: var(--text-primary);
  border: 1px solid var(--border-color);
}

.update-message.success {
  background: #4caf50;
  color: #fff;
  border: 1px solid #4caf50;
}

.update-message.error {
  background: #f44336;
  color: #fff;
  border: 1px solid #f44336;
}

.upload-section {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.btn-upload {
  background: var(--accent-secondary);
  color: #fff;
  border: none;
  border-radius: 4px;
  padding: 0.75rem 1.5rem;
  font-size: 1rem;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.2s;
  max-width: 200px;
}

.btn-upload:hover:not(:disabled) {
  background: var(--accent-secondary);
  opacity: 0.9;
}

.btn-upload:disabled {
  background: var(--text-tertiary);
  cursor: not-allowed;
  opacity: 0.6;
}

.branch-selector {
  display: flex;
  gap: 0.5rem;
  align-items: center;
}

.branch-selector select {
  flex: 1;
  min-width: 0;
}

.btn-fetch-branches {
  padding: 0.5rem 1rem;
  background: var(--accent-primary);
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.875rem;
  white-space: nowrap;
  transition: background 0.2s ease;
}

.btn-fetch-branches:hover:not(:disabled) {
  background: var(--accent-primary-hover, #0056b3);
}

.btn-fetch-branches:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.error-message {
  background: #f8d7da;
  color: #721c24;
  border: 1px solid #f5c6cb;
  padding: 0.5rem 1rem;
  border-radius: 4px;
  font-size: 0.9rem;
  margin-top: 0.5rem;
}

.success-message {
  background: #d4edda;
  color: #155724;
  border: 1px solid #c3e6cb;
  padding: 0.5rem 1rem;
  border-radius: 4px;
  font-size: 0.9rem;
}

.images-list {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  margin-top: 0.5rem;
}

.image-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.75rem;
  background: var(--bg-tertiary);
  border-radius: 4px;
  border: 1px solid var(--border-color);
  gap: 1rem;
}

.image-thumbnail {
  width: 80px;
  height: 80px;
  flex-shrink: 0;
  border-radius: 4px;
  overflow: hidden;
  background: var(--bg-secondary);
  display: flex;
  align-items: center;
  justify-content: center;
}

.thumbnail-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.image-info {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  flex: 1;
}

.image-info strong {
  font-size: 1rem;
  color: var(--text-primary);
}

.image-details {
  font-size: 0.85rem;
  color: var(--text-secondary);
  font-family: monospace;
}

/* Plugin Management Styles */
.plugins-list {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 1.5rem;
  margin-top: 1rem;
}

.plugins-container {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.plugin-tabs {
  display: flex;
  gap: 0.5rem;
  border-bottom: 2px solid var(--border-color);
  margin-bottom: 1.5rem;
}

.plugin-tab {
  padding: 0.75rem 1.5rem;
  background: transparent;
  border: none;
  border-bottom: 3px solid transparent;
  font-size: 1rem;
  font-weight: 500;
  color: var(--text-secondary);
  cursor: pointer;
  transition: all 0.2s ease;
  margin-bottom: -2px;
}

.plugin-tab:hover {
  color: var(--text-primary);
  background: var(--bg-secondary);
}

.plugin-tab.active {
  color: var(--accent-primary);
  border-bottom-color: var(--accent-primary);
  font-weight: 600;
}

.plugins-list {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(450px, 1fr));
  gap: 1.5rem;
}

.plugin-item {
  background: var(--bg-primary);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  padding: 2rem;
  transition: all 0.2s ease;
  display: flex;
  flex-direction: column;
}

.plugin-item:hover {
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.plugin-item.disabled {
  opacity: 0.6;
  background: var(--bg-secondary);
}

.plugin-header {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  margin-bottom: 1.5rem;
  padding-bottom: 1.5rem;
  border-bottom: 1px solid var(--border-color);
}

.plugin-header-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1.5rem;
  width: 100%;
}

.plugin-header-actions {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  flex-shrink: 0;
}

.plugin-info {
  flex: 1;
}

.plugin-title-row {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin-bottom: 0.5rem;
  flex-wrap: nowrap;
  min-width: 0; /* Allow flex items to shrink */
}

.plugin-title-row .running-indicator-aggregate {
  flex-shrink: 0;
  margin: 0;
}

.plugin-title-row strong {
  flex-shrink: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.running-indicator-aggregate {
  font-size: 1rem;
  font-weight: bold;
}

.running-indicator-aggregate.running {
  color: #4caf50; /* Green for all running */
}

.running-indicator-aggregate.stopped {
  color: #f44336; /* Red for all stopped */
}

.running-indicator-aggregate.partial {
  color: #ff9800; /* Orange for partially running */
}

.plugin-type-badge {
  padding: 0.25rem 0.75rem;
  border-radius: 12px;
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
  background: var(--bg-secondary);
  color: var(--text-secondary);
}

.plugin-type-badge.type-calendar {
  background: #e3f2fd;
  color: #1976d2;
}

.plugin-type-badge.type-image {
  background: #f3e5f5;
  color: #7b1fa2;
}

.plugin-type-badge.type-service {
  background: #e8f5e9;
  color: #388e3c;
}

.plugin-description {
  font-size: 0.875rem;
  color: var(--text-secondary);
  margin: 0;
  line-height: 1.4;
}

/* Plugin Instances Styles */
.plugin-instances-section {
  margin-top: 1.5rem;
  padding-top: 1.5rem;
  border-top: 1px solid var(--border-color);
}

.instances-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1rem;
}

.instance-count {
  font-weight: normal;
  color: var(--text-secondary);
  font-size: 0.9em;
}

.btn-add-instance {
  padding: 0.5rem 1rem;
  background: var(--accent-primary);
  color: #fff;
  border: none;
  border-radius: 4px;
  font-size: 0.9rem;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-add-instance:hover {
  background: var(--accent-secondary);
  opacity: 0.9;
}

.empty-instances {
  padding: 1.5rem;
  text-align: center;
  color: var(--text-tertiary);
  background: var(--bg-tertiary);
  border-radius: 4px;
  border: 1px dashed var(--border-color);
}

.instances-list {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.instance-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.75rem 1rem;
  background: var(--bg-tertiary);
  border-radius: 4px;
  border: 1px solid var(--border-color);
  gap: 1rem;
  transition: all 0.2s;
  min-width: 0;
  overflow: hidden;
}

.instance-item:hover {
  border-color: var(--accent-primary);
}

.instance-item.disabled {
  opacity: 0.6;
}

.instance-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  min-width: 0;
  overflow: hidden;
}

.instance-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  min-width: 0;
  flex: 1;
}

.instance-header h5 {
  margin: 0;
  font-size: 1rem;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
  min-width: 0;
}

.instance-header .running-indicator {
  flex-shrink: 0;
  margin: 0;
}

.running-indicator {
  font-size: 0.9rem;
  font-weight: bold;
}

.running-indicator.running {
  color: var(--accent-success, #4caf50);
}

.running-indicator.stopped {
  color: var(--text-tertiary);
}

.instance-details {
  margin-top: 0.25rem;
  min-width: 0;
  overflow: hidden;
}

.instance-detail-item {
  display: flex;
  align-items: center;
  font-size: 0.875rem;
  min-width: 0;
}

.instance-detail-label {
  font-weight: 500;
  color: var(--text-secondary);
  flex-shrink: 0;
  min-width: fit-content;
}

.instance-detail-value {
  color: var(--text-primary);
  font-size: 0.875rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
  max-width: 100%;
}

.btn-icon-only {
  padding: 0.4rem;
  width: 2rem;
  height: 2rem;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1rem;
  line-height: 1;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  background: transparent;
  transition: all 0.2s ease;
  flex-shrink: 0;
}

.btn-icon-only:hover {
  background: var(--bg-secondary);
  border-color: var(--accent-primary);
}

.instance-actions {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-shrink: 0;
  flex-wrap: nowrap;
}

.btn-action {
  background: transparent;
  border: 1px solid var(--border-color);
  color: var(--text-secondary);
  font-size: 0.875rem;
  width: 1.75rem;
  height: 1.75rem;
  padding: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.btn-action:hover {
  background: var(--bg-secondary);
  border-color: var(--accent-primary);
  color: var(--accent-primary);
}

.btn-action-danger {
  color: var(--accent-error);
}

.btn-action-danger:hover {
  border-color: var(--accent-error);
  background: rgba(220, 53, 69, 0.1);
}

.toggle-switch-small {
  position: relative;
  display: inline-block;
  width: 36px;
  height: 20px;
  margin: 0;
}

.toggle-switch-small input {
  opacity: 0;
  width: 0;
  height: 0;
}

.slider-small {
  position: absolute;
  cursor: pointer;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: var(--text-tertiary);
  transition: 0.4s;
  border-radius: 20px;
}

.slider-small:before {
  position: absolute;
  content: "";
  height: 14px;
  width: 14px;
  left: 3px;
  bottom: 3px;
  background-color: white;
  transition: 0.4s;
  border-radius: 50%;
}

.toggle-switch-small input:checked + .slider-small {
  background-color: var(--accent-primary);
}

.toggle-switch-small input:checked + .slider-small:before {
  transform: translateX(16px);
}

.btn-small {
  padding: 0.4rem 0.8rem;
  font-size: 0.85rem;
}

.btn-edit {
  background: var(--accent-primary);
  color: #fff;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-edit:hover {
  background: var(--accent-secondary);
  opacity: 0.9;
}

/* Instance Modal Styles */
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.instance-modal {
  background: var(--bg-primary);
  border-radius: 8px;
  max-width: 600px;
  width: 90%;
  max-height: 90vh;
  overflow-y: auto;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1.5rem;
  border-bottom: 1px solid var(--border-color);
}

.modal-header h3 {
  margin: 0;
  font-size: 1.25rem;
  color: var(--text-primary);
}

.btn-close-modal {
  background: none;
  border: none;
  font-size: 1.5rem;
  color: var(--text-secondary);
  cursor: pointer;
  padding: 0;
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
  transition: all 0.2s;
}

.btn-close-modal:hover {
  background: var(--bg-secondary);
  color: var(--text-primary);
}

.modal-body {
  padding: 1.5rem;
}

.error-message {
  padding: 0.75rem 1rem;
  background: var(--accent-error, #f44336);
  color: #fff;
  border-radius: 4px;
  margin-bottom: 1rem;
  font-size: 0.9rem;
}

.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 1rem;
  margin-top: 1.5rem;
  padding-top: 1.5rem;
  border-top: 1px solid var(--border-color);
}

.btn-primary {
  padding: 0.75rem 1.5rem;
  background: var(--accent-primary);
  color: #fff;
  border: none;
  border-radius: 4px;
  font-size: 1rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-primary:hover:not(:disabled) {
  background: var(--accent-secondary);
  opacity: 0.9;
}

.btn-primary:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.plugin-config {
  margin-top: 1rem;
}

.config-section-title {
  font-size: 0.875rem;
  font-weight: 600;
  margin-bottom: 0.75rem;
  color: var(--text-primary);
}

.plugin-setting {
  margin-bottom: 1rem;
}

.plugin-setting label {
  display: block;
  margin-bottom: 0.5rem;
  font-size: 0.875rem;
  font-weight: 500;
  color: var(--text-primary);
}

.plugin-disabled-message {
  margin-top: 1rem;
  padding: 0.75rem;
  background: var(--bg-secondary);
  border-radius: 4px;
}

.plugin-disabled-message .help-text {
  margin: 0;
  font-size: 0.875rem;
  color: var(--text-secondary);
}

/* Compact Plugin Install UI */
.plugin-install-compact {
  margin-top: 1rem;
}

.plugin-install-tabs {
  display: flex;
  gap: 0.5rem;
  margin-bottom: 1rem;
  border-bottom: 1px solid var(--border-color);
}

.install-tab {
  padding: 0.5rem 1rem;
  background: transparent;
  border: none;
  border-bottom: 2px solid transparent;
  color: var(--text-secondary);
  font-size: 0.9rem;
  cursor: pointer;
  transition: all 0.2s;
}

.install-tab:hover {
  color: var(--text-primary);
}

.install-tab.active {
  color: var(--accent-primary);
  border-bottom-color: var(--accent-primary);
  font-weight: 600;
}

.plugin-install-content {
  padding: 1rem;
  background: var(--bg-tertiary);
  border-radius: 4px;
  border: 1px solid var(--border-color);
}

.install-compact-row {
  display: flex;
  gap: 0.5rem;
  align-items: center;
  flex-wrap: wrap;
}

.github-input-compact {
  flex: 1;
  min-width: 200px;
  padding: 0.5rem;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  font-size: 0.9rem;
  background: var(--bg-primary);
  color: var(--text-primary);
}

.github-branch-compact {
  width: 120px;
  padding: 0.5rem;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  font-size: 0.9rem;
  background: var(--bg-primary);
  color: var(--text-primary);
}

.selected-file-compact {
  font-size: 0.875rem;
  color: var(--text-secondary);
  font-style: italic;
}

.branch-switch-notice-compact {
  margin-top: 0.5rem;
  padding: 0.5rem;
  background: rgba(23, 162, 184, 0.1);
  border: 1px solid rgba(23, 162, 184, 0.3);
  border-radius: 4px;
  font-size: 0.8125rem;
  color: #0c5460;
}

.available-plugins-compact {
  margin-top: 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.plugin-item-inline {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.75rem;
  background: var(--bg-primary);
  border: 1px solid var(--border-color);
  border-radius: 4px;
  gap: 1rem;
}

.plugin-info-inline {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex: 1;
  min-width: 0;
}

.plugin-info-inline strong {
  font-size: 0.9rem;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.plugin-type-badge-small {
  padding: 0.2rem 0.5rem;
  border-radius: 3px;
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
}

.plugin-version-small {
  font-size: 0.75rem;
  color: var(--text-secondary);
}

/* Legacy styles (kept for backward compatibility) */
.plugin-install-section {
  margin-top: 1rem;
  padding: 1rem;
  background: var(--bg-secondary);
  border-radius: 4px;
  border: 1px solid var(--border-color);
}

.plugin-install-method {
  margin-bottom: 1.5rem;
}

.plugin-install-method:last-child {
  margin-bottom: 0;
}

.plugin-install-method h4 {
  font-size: 0.875rem;
  font-weight: 600;
  margin-bottom: 0.75rem;
  color: var(--text-primary);
}

.file-upload-area {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.selected-file {
  font-size: 0.875rem;
  color: var(--text-secondary);
  font-style: italic;
}

.github-install-form {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.github-install-form .form-group {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.github-install-form .form-group label {
  font-size: 0.875rem;
  font-weight: 500;
  color: var(--text-primary);
}

.github-install-form .form-group input {
  padding: 0.5rem;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  font-size: 0.875rem;
  background: var(--bg-primary);
  color: var(--text-primary);
}

.github-install-form .form-group input:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.github-actions {
  display: flex;
  gap: 0.75rem;
  margin-top: 0.5rem;
}

.available-plugins {
  margin-top: 1.5rem;
  padding: 1rem;
  background: var(--bg-tertiary);
  border-radius: 4px;
  border: 1px solid var(--border-color);
}

.available-plugins h5 {
  font-size: 0.875rem;
  font-weight: 600;
  margin-bottom: 0.75rem;
  color: var(--text-primary);
}

.plugins-list-compact {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.plugin-item-compact {
  padding: 0.75rem;
  background: var(--bg-primary);
  border: 1px solid var(--border-color);
  border-radius: 4px;
}

.plugin-info-compact {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 0.5rem;
}

.plugin-info-compact strong {
  font-size: 0.875rem;
  color: var(--text-primary);
}

.plugin-version {
  font-size: 0.75rem;
  color: var(--text-secondary);
  font-style: italic;
}

.plugin-description-compact {
  font-size: 0.8125rem;
  color: var(--text-secondary);
  margin: 0.5rem 0;
  line-height: 1.4;
}

.plugin-item-compact .btn-small {
  padding: 0.5rem 1rem;
  font-size: 0.875rem;
}

.restart-notice {
  margin-top: 1rem;
  padding: 1rem;
  background: rgba(255, 193, 7, 0.1);
  border: 1px solid rgba(255, 193, 7, 0.3);
  border-radius: 4px;
  border-left: 4px solid #ffc107;
}

.restart-notice-content {
  color: #856404;
}

.restart-notice-content strong {
  display: block;
  margin-bottom: 0.5rem;
  font-size: 0.875rem;
  color: #856404;
}

.restart-notice-content p {
  margin: 0.5rem 0;
  font-size: 0.875rem;
  line-height: 1.5;
}

.restart-instructions {
  font-weight: 500;
  margin-top: 0.75rem !important;
}

.branch-switch-notice {
  margin-top: 0.75rem;
  padding: 0.5rem;
  background: rgba(23, 162, 184, 0.1);
  border: 1px solid rgba(23, 162, 184, 0.3);
  border-radius: 4px;
  font-size: 0.8125rem;
  color: #0c5460;
}

/* Plugin Install Buttons - More Colorful */
.btn-browse {
  padding: 0.5rem 1rem;
  background: var(--accent-primary);
  color: #fff;
  border: none;
  border-radius: 4px;
  font-size: 0.9rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
  white-space: nowrap;
}

.btn-browse:hover:not(:disabled) {
  background: var(--accent-secondary);
  opacity: 0.9;
  transform: translateY(-1px);
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
}

.btn-browse:disabled {
  opacity: 0.6;
  cursor: not-allowed;
  transform: none;
}

.btn-install {
  padding: 0.5rem 1rem;
  background: #4caf50;
  color: #fff;
  border: none;
  border-radius: 4px;
  font-size: 0.85rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
  white-space: nowrap;
}

.btn-install:hover:not(:disabled) {
  background: #45a049;
  transform: translateY(-1px);
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
}

.btn-install:disabled {
  opacity: 0.6;
  cursor: not-allowed;
  transform: none;
}

.btn-upload {
  padding: 0.5rem 1rem;
  background: #2196f3;
  color: #fff;
  border: none;
  border-radius: 4px;
  font-size: 0.9rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
  white-space: nowrap;
}

.btn-upload:hover:not(:disabled) {
  background: #1976d2;
  transform: translateY(-1px);
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
}

.btn-upload:disabled {
  opacity: 0.6;
  cursor: not-allowed;
  transform: none;
}

.help-text-compact {
  font-size: 0.875rem;
  color: var(--text-secondary);
  margin: 0 0 0.75rem 0;
  line-height: 1.4;
}

.branch-switch-notice-info {
  margin-top: 1rem;
  padding: 0.75rem;
  background: rgba(23, 162, 184, 0.1);
  border: 1px solid rgba(23, 162, 184, 0.3);
  border-radius: 4px;
  font-size: 0.875rem;
  color: #0c5460;
}

.error-message {
  margin-top: 1rem;
  padding: 0.75rem;
  background: rgba(220, 53, 69, 0.1);
  border: 1px solid rgba(220, 53, 69, 0.3);
  border-radius: 4px;
  color: #dc3545;
  font-size: 0.875rem;
}

.success-message {
  margin-top: 1rem;
  padding: 0.75rem;
  background: rgba(40, 167, 69, 0.1);
  border: 1px solid rgba(40, 167, 69, 0.3);
  border-radius: 4px;
  color: #28a745;
  font-size: 0.875rem;
}

.plugin-instance-note {
  margin-top: 1rem;
  margin-bottom: 1rem;
  padding: 0.75rem;
  background: var(--bg-tertiary);
  border-radius: 4px;
  border-left: 3px solid var(--accent-primary);
}

.plugin-instance-note .help-text {
  margin: 0;
  font-size: 0.875rem;
  color: var(--text-secondary);
}

.btn-settings-icon {
  color: var(--text-secondary);
}

.btn-settings-icon:hover {
  color: var(--accent-primary);
}

.btn-settings-icon.active {
  background: var(--accent-primary);
  color: #fff;
  border-color: var(--accent-primary);
}

/* Service Ordering Styles */
.service-ordering-list {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.service-plugin-order-item {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 1rem;
  background: var(--bg-primary);
  border: 1px solid var(--border-color);
  border-radius: 6px;
  transition: all 0.2s ease;
}

.service-plugin-order-item:hover {
  border-color: var(--accent-primary);
  box-shadow: 0 2px 4px var(--shadow);
}

.service-plugin-order-handle {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  color: var(--text-secondary);
}

.order-number {
  font-weight: 600;
  color: var(--accent-primary);
  min-width: 1.5rem;
  text-align: center;
}

.drag-handle {
  cursor: grab;
  font-size: 1.2rem;
  line-height: 1;
  color: var(--text-tertiary);
  user-select: none;
}

.drag-handle:active {
  cursor: grabbing;
}

.service-plugin-info {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.instance-count-badge {
  padding: 0.25rem 0.5rem;
  background: var(--bg-secondary);
  border-radius: 12px;
  font-size: 0.75rem;
  color: var(--text-secondary);
}

.service-plugin-order-control {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.service-plugin-order-control label {
  font-size: 0.875rem;
  color: var(--text-secondary);
}

.order-input {
  width: 4rem;
  padding: 0.5rem;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  background: var(--bg-secondary);
  color: var(--text-primary);
  font-size: 0.875rem;
  text-align: center;
}

.order-input:focus {
  outline: none;
  border-color: var(--accent-primary);
  box-shadow: 0 0 0 2px rgba(var(--accent-primary-rgb), 0.2);
}

/* Responsive styles */
@media (max-width: 1024px) {
  .settings-layout {
    grid-template-columns: 200px 1fr;
    gap: 1.5rem;
  }

  .category-label {
    font-size: 0.9rem;
  }
}

@media (max-width: 768px) {
  .settings-page {
    padding: 1rem;
  }

  .settings-layout {
    grid-template-columns: 1fr;
    gap: 1rem;
  }

  .settings-sidebar {
    position: static;
    order: -1;
  }

  .category-nav {
    flex-direction: row;
    flex-wrap: wrap;
    gap: 0.5rem;
  }

  .category-btn {
    flex: 1;
    min-width: calc(33.333% - 0.5rem);
    justify-content: center;
    padding: 0.75rem 0.5rem;
  }

  .category-icon {
    display: none;
  }

  .category-label {
    font-size: 0.85rem;
    text-align: center;
  }

  .settings-actions {
    padding: 0 1rem;
  }
}

/* Theme Selection Styles */
.theme-selection-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
  gap: 1rem;
  margin-top: 0.5rem;
}

.theme-selection-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 1rem;
  background: var(--bg-secondary);
  border: 2px solid var(--border-color);
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.theme-selection-item:hover {
  border-color: var(--accent-primary);
  box-shadow: 0 2px 8px var(--shadow);
  transform: translateY(-2px);
}

.theme-selection-item.active {
  border-color: var(--accent-primary);
  background: var(--bg-tertiary);
  box-shadow: 0 4px 12px var(--shadow-hover);
}

.theme-selection-preview {
  position: relative;
  width: 100%;
  aspect-ratio: 16 / 9;
  border-radius: 6px;
  overflow: hidden;
  margin-bottom: 0.5rem;
  background: var(--bg-primary);
  border: 1px solid var(--border-color);
}

.theme-preview-image {
  width: 100%;
  height: 100%;
  background-size: cover;
  background-position: center;
}

.theme-preview-placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 2rem;
  font-weight: bold;
  color: var(--text-secondary);
  background: linear-gradient(
    135deg,
    var(--accent-primary),
    var(--accent-secondary)
  );
}

.theme-selected-badge {
  position: absolute;
  top: 0.25rem;
  right: 0.25rem;
  width: 1.5rem;
  height: 1.5rem;
  background: var(--accent-primary);
  color: white;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.875rem;
  font-weight: bold;
  box-shadow: 0 2px 4px var(--shadow);
}

.theme-selection-info {
  text-align: center;
  width: 100%;
}

.theme-selection-info strong {
  display: block;
  font-size: 0.875rem;
  color: var(--text-primary);
  margin-bottom: 0.25rem;
}

.theme-badge-small {
  display: inline-block;
  padding: 0.125rem 0.375rem;
  background: var(--bg-tertiary);
  color: var(--text-secondary);
  border-radius: 4px;
  font-size: 0.7rem;
  margin-left: 0.25rem;
}

/* Themes Management (in Plugins tab) */
.themes-management {
  padding: 1rem 0;
}

.themes-list-compact {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  margin-top: 0.5rem;
}

.theme-item-compact {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.75rem;
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: 6px;
}

.theme-item-compact.builtin {
  background: var(--bg-tertiary);
}

.theme-item-info {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex: 1;
}

.theme-item-info strong {
  color: var(--text-primary);
}

.theme-item-actions {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}
</style>
