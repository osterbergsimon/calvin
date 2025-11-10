<template>
  <div class="settings-page">
    <div class="settings-header">
      <h1>Settings & Configuration</h1>
      <button class="btn-back" @click="goBack">← Back to Dashboard</button>
    </div>

    <div class="settings-content">
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
            <label>Calendar Split (%)</label>
            <input
              v-model.number="localConfig.calendarSplit"
              type="number"
              min="66"
              max="75"
              @change="updateCalendarSplit"
            />
            <span class="help-text">Calendar width percentage (66-75%)</span>
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
              <option v-if="localConfig.orientation === 'portrait'" value="top">
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
            <span class="help-text">Theme selection mode</span>
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
        </div>
      </section>

      <!-- Photo Settings -->
      <section
        class="settings-section collapsible"
        :class="{ expanded: expandedSections.photos }"
      >
        <div class="section-header" @click="toggleSection('photos')">
          <h2>Photo Settings</h2>
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
              <option value="center">Center (Center image, no scaling)</option>
            </select>
            <span class="help-text"
              >How images are displayed. Smart mode automatically chooses the best fit based on image and screen dimensions.</span
            >
          </div>
          <div class="setting-item">
            <label>Upload Images</label>
            <div class="upload-section">
              <input
                ref="fileInput"
                type="file"
                accept="image/*"
                multiple
                style="display: none"
                @change="handleFileSelect"
              />
              <button
                class="btn-upload"
                @click="$refs.fileInput.click()"
                :disabled="uploading"
              >
                {{ uploading ? "Uploading..." : "Choose Images" }}
              </button>
              <span class="help-text"
                >Select one or more image files to upload (JPG, PNG, WebP, GIF)</span
              >
              <div v-if="uploadError" class="error-message">
                {{ uploadError }}
              </div>
              <div v-if="uploadSuccess" class="success-message">
                {{ uploadSuccess }}
              </div>
            </div>
          </div>
          <div class="setting-item">
            <label>Manage Images</label>
            <div class="images-list">
              <div
                v-for="image in imagesList"
                :key="image.id"
                class="image-item"
              >
                <div class="image-thumbnail">
                  <img
                    :src="`/api/images/${image.id}/thumbnail`"
                    :alt="image.filename"
                    class="thumbnail-img"
                    @error="handleThumbnailError"
                  />
                </div>
                <div class="image-info">
                  <strong>{{ image.filename }}</strong>
                  <span class="image-details"
                    >{{ image.width }}×{{ image.height }} • {{ formatFileSize(image.size) }}</span
                  >
                </div>
                <button
                  class="btn-remove"
                  title="Delete image"
                  @click="deleteImage(image.id)"
                >
                  Delete
                </button>
              </div>
              <div v-if="imagesList.length === 0" class="empty-state">
                <p>No images uploaded yet</p>
              </div>
            </div>
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
              >Time before switching to photo frame mode (60-3600 seconds)</span
            >
          </div>
        </div>
      </section>

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
            <span class="help-text">Display full month or rolling weeks</span>
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
            <span class="help-text">First day of the week in the calendar</span>
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
            <label>Calendar Sources</label>
            <!-- Add Calendar Source Form -->
            <div class="add-calendar-form">
              <h3>Add Calendar Source</h3>
              <div class="form-group">
                <label>Calendar Type</label>
                <select v-model="newCalendarSource.type" class="form-select">
                  <option value="google">Google Calendar</option>
                  <option value="proton">Proton Calendar</option>
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
                    newCalendarSource.type === 'google'
                      ? 'https://calendar.google.com/calendar/u/0?cid=...'
                      : 'https://calendar.proton.me/api/calendar/v1/url/.../calendar.ics?CacheKey=...&PassphraseKey=...'
                  "
                  class="form-input"
                />
                <span class="help-text">
                  <span v-if="newCalendarSource.type === 'google'">
                    Google Calendar: Share link or iCal URL from Google Calendar
                    settings
                  </span>
                  <span v-else>
                    Proton Calendar: iCal feed URL from Proton Calendar sharing
                    settings (includes CacheKey and PassphraseKey)
                  </span>
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
                          updateSourceShowTime(source.id, $event.target.checked)
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
                      @change="toggleSource(source.id, $event.target.checked)"
                    />
                    <span class="slider" />
                  </label>
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

      <!-- Web Services Settings -->
      <section
        class="settings-section collapsible"
        :class="{ expanded: expandedSections.webServices }"
      >
        <div class="section-header" @click="toggleSection('webServices')">
          <h2>Web Services</h2>
          <span class="toggle-icon">{{
            expandedSections.webServices ? "▼" : "▶"
          }}</span>
        </div>
        <div v-show="expandedSections.webServices" class="section-content">
          <!-- Add Web Service Form -->
          <div class="add-web-service-form">
            <h3>Add Web Service</h3>
            <div class="form-group">
              <label>Service Name</label>
              <input
                v-model="newWebService.name"
                type="text"
                placeholder="Shopping List"
                class="form-input"
              />
            </div>
            <div class="form-group">
              <label>Service URL</label>
              <input
                v-model="newWebService.url"
                type="text"
                placeholder="https://example.com/shopping"
                class="form-input"
              />
              <span class="help-text">
                Note: Some websites block embedding in iframes due to security
                restrictions (CORS/X-Frame-Options). If a service cannot be
                embedded, you'll see an error message with an option to open it
                in a new window.
              </span>
            </div>
            <div class="form-group">
              <label>
                <input v-model="newWebService.fullscreen" type="checkbox" />
                Prefer Fullscreen Mode
              </label>
              <span class="help-text"
                >Open this service in fullscreen by default</span
              >
            </div>
            <button
              class="btn-add"
              :disabled="!canAddWebService"
              @click="addWebService"
            >
              Add Web Service
            </button>
          </div>

          <!-- Web Services List -->
          <div class="web-services-list">
            <h3>Configured Web Services</h3>
            <div v-if="webServices.length === 0" class="empty-state">
              <p>No web services configured</p>
              <p class="help-text">Add a web service above to get started</p>
            </div>
            <div v-else class="services-list">
              <div
                v-for="service in webServices"
                :key="service.id"
                class="service-item"
              >
                <div class="service-info">
                  <div class="service-header">
                    <h4>{{ service.name }}</h4>
                    <span class="service-url-display">{{ service.url }}</span>
                  </div>
                  <div class="service-settings">
                    <div class="service-setting">
                      <label>Display Order:</label>
                      <input
                        type="number"
                        :value="service.display_order"
                        class="order-input"
                        min="0"
                        @change="
                          updateServiceOrder(
                            service.id,
                            parseInt($event.target.value),
                          )
                        "
                      />
                    </div>
                    <div class="service-setting">
                      <label>
                        <input
                          type="checkbox"
                          :checked="service.fullscreen"
                          @change="
                            updateServiceFullscreen(
                              service.id,
                              $event.target.checked,
                            )
                          "
                        />
                        Prefer Fullscreen
                      </label>
                    </div>
                  </div>
                </div>
                <div class="service-actions">
                  <label class="toggle-switch">
                    <input
                      type="checkbox"
                      :checked="service.enabled"
                      @change="
                        toggleWebService(service.id, $event.target.checked)
                      "
                    />
                    <span class="slider" />
                  </label>
                  <button
                    class="btn-remove"
                    title="Remove web service"
                    @click="removeWebService(service.id)"
                  >
                    Remove
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

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
          <div v-if="localConfig.displayScheduleEnabled" class="setting-item">
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
              >Configure on/off times for each day of the week. Display will be on during the specified time range.</span
            >
          </div>
          <div class="setting-item">
            <label>Timezone</label>
            <select
              v-model="localConfig.timezone"
              @change="updateTimezone"
            >
              <option :value="null">System Timezone (Default)</option>
              <option value="UTC">UTC</option>
              <option value="America/New_York">America/New_York (EST/EDT)</option>
              <option value="America/Chicago">America/Chicago (CST/CDT)</option>
              <option value="America/Denver">America/Denver (MST/MDT)</option>
              <option value="America/Los_Angeles">America/Los_Angeles (PST/PDT)</option>
              <option value="Europe/London">Europe/London (GMT/BST)</option>
              <option value="Europe/Paris">Europe/Paris (CET/CEST)</option>
              <option value="Europe/Berlin">Europe/Berlin (CET/CEST)</option>
              <option value="Europe/Stockholm">Europe/Stockholm (CET/CEST)</option>
              <option value="Asia/Tokyo">Asia/Tokyo (JST)</option>
              <option value="Asia/Shanghai">Asia/Shanghai (CST)</option>
              <option value="Australia/Sydney">Australia/Sydney (AEDT/AEST)</option>
            </select>
            <span class="help-text"
              >Timezone for display schedule. Leave as "System Timezone" to use the Pi's timezone.</span
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
          <div v-if="localConfig.displayTimeoutEnabled" class="setting-item">
            <label>Display Timeout (seconds)</label>
            <input
              v-model.number="localConfig.displayTimeout"
              type="number"
              min="0"
              max="3600"
              step="60"
              @change="updateDisplayTimeout"
            />
            <span class="help-text">Turn display off after this many seconds of inactivity (0 = never, max 3600)</span>
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
            <span class="help-text">How long to hold both keys to trigger reboot (1000-60000 ms)</span>
          </div>
          <div class="setting-item">
            <span class="help-text"
              >Hold {{ localConfig.rebootComboKey1 }} + {{ localConfig.rebootComboKey2 }} for
              {{ (localConfig.rebootComboDuration / 1000).toFixed(1) }} seconds to reboot</span
            >
          </div>
        </div>
      </section>

      <!-- Actions -->
      <section class="settings-section">
        <h2>Actions</h2>
        <div class="actions-list">
          <button class="btn-save" @click="saveAllSettings">
            Save All Settings
          </button>
          <button class="btn-reset" @click="resetToDefaults">
            Reset to Defaults
          </button>
          <button 
            class="btn-update" 
            :disabled="updateInProgress"
            @click="triggerUpdate"
          >
            {{ updateInProgress ? "Updating..." : "🔄 Update from GitHub" }}
          </button>
          <div v-if="updateMessage" class="update-message" :class="updateMessageClass">
            {{ updateMessage }}
          </div>
        </div>
      </section>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from "vue";
import { useRouter } from "vue-router";
import { useConfigStore } from "../stores/config";
import { useKeyboardStore } from "../stores/keyboard";
import { useCalendarStore } from "../stores/calendar";
import { useWebServicesStore } from "../stores/webServices";
import { useModeStore } from "../stores/mode";
import { useImagesStore } from "../stores/images";
import axios from "axios";

const router = useRouter();
const configStore = useConfigStore();
const keyboardStore = useKeyboardStore();
const calendarStore = useCalendarStore();
const webServicesStore = useWebServicesStore();
const modeStore = useModeStore();
const imagesStore = useImagesStore();

const localConfig = ref({
  orientation: "landscape",
  calendarSplit: 70,
  sideViewPosition: "right",
  keyboardType: "7-button",
  photoFrameEnabled: false,
  photoFrameTimeout: 300,
  showUI: true,
  showModeIndicator: true,
  photoRotationInterval: 30,
  calendarViewMode: "month",
  timeFormat: "24h",
  themeMode: "auto",
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
  rebootComboKey1: "KEY_1",
  rebootComboKey2: "KEY_7",
  rebootComboDuration: 10000,
  imageDisplayMode: "smart",
});

// Collapsible sections state
const expandedSections = ref({
  display: true,
  ui: true,
  photos: true,
  photoFrame: false,
  keyboard: false,
  calendar: false,
  webServices: false,
  displayPower: false,
  rebootCombo: false,
});

const toggleSection = (section) => {
  expandedSections.value[section] = !expandedSections.value[section];
};

const currentMappings = ref({});
const calendarSources = ref([]);
const webServices = ref([]);
const imagesList = ref([]);
const uploading = ref(false);
const uploadError = ref("");
const uploadSuccess = ref("");

const newCalendarSource = ref({
  type: "google",
  name: "",
  ical_url: "",
});

const newWebService = ref({
  name: "",
  url: "",
  fullscreen: false,
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

const canAddWebService = computed(() => {
  return (
    newWebService.value.name.trim() !== "" &&
    newWebService.value.url.trim() !== ""
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
  { value: "calendar_next_month", label: "Calendar: Next Month (direct)" },
  { value: "calendar_prev_month", label: "Calendar: Previous Month (direct)" },
  { value: "calendar_expand_today", label: "Calendar: Expand Today (direct)" },
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

const updatePhotoFrameEnabled = () => {
  configStore.setPhotoFrameEnabled(localConfig.value.photoFrameEnabled);
  saveConfig();
};

const updatePhotoFrameTimeout = () => {
  configStore.setPhotoFrameTimeout(localConfig.value.photoFrameTimeout);
  saveConfig();
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

const updateWeekStartDay = () => {
  configStore.setWeekStartDay(localConfig.value.weekStartDay);
  saveConfig();
};

const updateShowWeekNumbers = () => {
  configStore.setShowWeekNumbers(localConfig.value.showWeekNumbers);
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
  const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
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
      localConfig.value.calendarSplit = response.data.calendarSplit || 70;
      localConfig.value.keyboardType = response.data.keyboardType || "7-button";
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
      localConfig.value.sideViewPosition =
        response.data.sideViewPosition ??
        response.data.side_view_position ??
        "right";
      // Handle displayScheduleEnabled - check for both camelCase and snake_case
      // Use !== undefined to properly handle false values
      if (response.data.displayScheduleEnabled !== undefined) {
        localConfig.value.displayScheduleEnabled = response.data.displayScheduleEnabled;
      } else if (response.data.display_schedule_enabled !== undefined) {
        localConfig.value.displayScheduleEnabled = response.data.display_schedule_enabled;
      } else {
        localConfig.value.displayScheduleEnabled = false;
      }
      localConfig.value.displayOffTime =
        response.data.displayOffTime ?? response.data.display_off_time ?? "22:00";
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
          localConfig.value.displaySchedule = JSON.parse(response.data.displaySchedule);
        } else {
          localConfig.value.displaySchedule = response.data.displaySchedule;
        }
      } else if (response.data.display_schedule !== undefined) {
        if (typeof response.data.display_schedule === "string") {
          localConfig.value.displaySchedule = JSON.parse(response.data.display_schedule);
        } else {
          localConfig.value.displaySchedule = response.data.display_schedule;
        }
      } else {
        // Ensure default schedule is set if not provided
        if (!localConfig.value.displaySchedule || localConfig.value.displaySchedule.length === 0) {
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
        response.data.rebootComboKey1 ?? response.data.reboot_combo_key1 ?? "KEY_1";
      localConfig.value.rebootComboKey2 =
        response.data.rebootComboKey2 ?? response.data.reboot_combo_key2 ?? "KEY_7";
      localConfig.value.rebootComboDuration =
        response.data.rebootComboDuration ?? response.data.reboot_combo_duration ?? 10000;
      localConfig.value.imageDisplayMode =
        response.data.imageDisplayMode ?? response.data.image_display_mode ?? "smart";
      localConfig.value.timezone = response.data.timezone ?? null;
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

const loadWebServices = async () => {
  try {
    await webServicesStore.fetchServices();
    webServices.value = webServicesStore.services;
  } catch (error) {
    console.error("Failed to load web services:", error);
  }
};

const loadImages = async () => {
  try {
    await imagesStore.fetchImages();
    imagesList.value = imagesStore.images;
  } catch (error) {
    console.error("Failed to load images:", error);
  }
};

const handleFileSelect = async (event) => {
  const files = event.target.files;
  if (!files || files.length === 0) return;

  uploading.value = true;
  uploadError.value = "";
  uploadSuccess.value = "";

  try {
    const uploadPromises = Array.from(files).map((file) => imagesStore.uploadImage(file));
    await Promise.all(uploadPromises);
    uploadSuccess.value = `Successfully uploaded ${files.length} image(s)`;
    await loadImages();
    // Clear file input
    event.target.value = "";
    // Clear success message after 3 seconds
    setTimeout(() => {
      uploadSuccess.value = "";
    }, 3000);
  } catch (error) {
    uploadError.value = error.response?.data?.detail || error.message || "Failed to upload images";
    console.error("Failed to upload images:", error);
    // Clear error message after 5 seconds
    setTimeout(() => {
      uploadError.value = "";
    }, 5000);
  } finally {
    uploading.value = false;
  }
};

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

const formatFileSize = (bytes) => {
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + " " + sizes[i];
};

const handleThumbnailError = (event) => {
  // Hide broken thumbnail images
  event.target.style.display = "none";
};

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

const addWebService = async () => {
  if (!canAddWebService.value) {
    alert("Please fill in service name and URL");
    return;
  }

  try {
    const service = {
      name: newWebService.value.name.trim(),
      url: newWebService.value.url.trim(),
      enabled: true,
      display_order: webServices.value.length,
      fullscreen: newWebService.value.fullscreen,
    };

    await webServicesStore.addService(service);

    // Reset form
    newWebService.value = {
      name: "",
      url: "",
      fullscreen: false,
    };

    // Reload services
    await loadWebServices();
  } catch (error) {
    console.error("Failed to add web service:", error);
    const errorMessage =
      error.response?.data?.detail ||
      error.message ||
      "Failed to add web service";
    alert(`Error: ${errorMessage}`);
  }
};

const removeWebService = async (serviceId) => {
  if (!confirm("Are you sure you want to remove this web service?")) {
    return;
  }

  try {
    await webServicesStore.removeService(serviceId);
    await loadWebServices();
  } catch (error) {
    console.error("Failed to remove web service:", error);
    alert(
      `Error: ${error.response?.data?.detail || error.message || "Failed to remove web service"}`,
    );
  }
};

const toggleWebService = async (serviceId, enabled) => {
  try {
    await webServicesStore.updateService(serviceId, { enabled });
    await loadWebServices();
  } catch (error) {
    console.error("Failed to toggle web service:", error);
    alert(
      `Error: ${error.response?.data?.detail || error.message || "Failed to toggle web service"}`,
    );
  }
};

const updateServiceOrder = async (serviceId, order) => {
  try {
    await webServicesStore.updateService(serviceId, { display_order: order });
    await loadWebServices();
  } catch (error) {
    console.error("Failed to update service order:", error);
    alert(
      `Error: ${error.response?.data?.detail || error.message || "Failed to update service order"}`,
    );
  }
};

const updateServiceFullscreen = async (serviceId, fullscreen) => {
  try {
    await webServicesStore.updateService(serviceId, { fullscreen });
    await loadWebServices();
  } catch (error) {
    console.error("Failed to update service fullscreen setting:", error);
    alert(
      `Error: ${error.response?.data?.detail || error.message || "Failed to update service setting"}`,
    );
  }
};

const saveConfig = async () => {
  try {
    await axios.post("/api/config", {
      orientation: localConfig.value.orientation,
      calendarSplit: localConfig.value.calendarSplit,
      keyboardType: localConfig.value.keyboardType,
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
    });
  } catch (error) {
    console.error("Failed to save config:", error);
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
    console.error("Failed to save keyboard mappings:", error);
  }
};

const saveAllSettings = async () => {
  await saveConfig();
  await saveKeyboardMappings();
  alert("Settings saved successfully!");
};

const resetToDefaults = async () => {
  if (confirm("Are you sure you want to reset all settings to defaults?")) {
    localConfig.value = {
      orientation: "landscape",
      calendarSplit: 70,
      keyboardType: "7-button",
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
  updateMessage.value = "Starting update...";
  updateMessageClass.value = "info";
  
  try {
    const response = await axios.post("/api/system/update");
    updateMessage.value = response.data.message || "Update started successfully";
    updateMessageClass.value = "info";
    
    // Poll for update status
    let pollCount = 0;
    const maxPolls = 120; // 10 minutes max (120 * 5 seconds)
    
    const checkStatus = async () => {
      pollCount++;
      
      // Safety timeout
      if (pollCount > maxPolls) {
        updateInProgress.value = false;
        updateMessage.value = "Update is taking longer than expected. Please check the logs manually.";
        updateMessageClass.value = "error";
        return;
      }
      
      try {
        const statusResponse = await axios.get("/api/system/update/status");
        const status = statusResponse.data.status;
        const lastLog = statusResponse.data.last_log || "";
        const message = statusResponse.data.message || "";
        
        if (status === "idle" || status === "completed") {
          updateInProgress.value = false;
          updateMessage.value = "✅ Update completed successfully! Reloading page...";
          updateMessageClass.value = "success";
          // Reload page after a delay to show updated frontend
          setTimeout(() => {
            window.location.reload();
          }, 2000);
        } else if (status === "error") {
          updateInProgress.value = false;
          updateMessage.value = `❌ Update failed: ${message}\n\nLast log:\n${lastLog}`;
          updateMessageClass.value = "error";
        } else if (status === "running") {
          // Show progress with last log lines
          const logLines = lastLog.split('\n').filter(line => line.trim()).slice(-3);
          const progressText = logLines.length > 0 
            ? logLines.join('\n') 
            : message || "Update in progress...";
          updateMessage.value = `🔄 ${progressText}`;
          updateMessageClass.value = "info";
          // Check again in 3 seconds for more responsive updates
          setTimeout(checkStatus, 3000);
        } else {
          // Unknown status, keep checking
          updateMessage.value = `⏳ ${message || "Checking update status..."}`;
          updateMessageClass.value = "info";
          setTimeout(checkStatus, 3000);
        }
      } catch (error) {
        console.error("Failed to check update status:", error);
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
    console.error("Failed to trigger update:", error);
  }
};

onMounted(async () => {
  await loadConfig();
  await loadKeyboardMappings();
  await loadCalendarSources();
  await loadWebServices();
  await loadImages();
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

.settings-content {
  max-width: 1200px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 2rem;
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

.btn-secondary {
  background: var(--bg-tertiary);
  color: var(--text-primary);
  border: 1px solid var(--border-color);
  border-radius: 4px;
  padding: 0.5rem 1rem;
  cursor: pointer;
  font-size: 0.9rem;
  transition: all 0.2s;
}

.btn-secondary:hover {
  background: var(--bg-secondary);
  border-color: var(--accent-primary);
}

.btn-remove {
  background: var(--accent-error);
  color: #fff; /* Keep white for contrast on error background */
  border: none;
  border-radius: 4px;
  padding: 0.5rem 1rem;
  font-size: 0.9rem;
  cursor: pointer;
  transition: background 0.2s;
}

.btn-remove:hover {
  background: var(--accent-error);
  opacity: 0.9;
}

.actions-list {
  display: flex;
  gap: 1rem;
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

.update-message {
  margin-top: 1rem;
  padding: 0.75rem 1rem;
  border-radius: 4px;
  font-size: 0.9rem;
  white-space: pre-wrap;
  word-wrap: break-word;
  max-height: 300px;
  overflow-y: auto;
  font-family: 'Courier New', monospace;
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

.success-message {
  color: #4caf50;
  font-size: 0.9rem;
  padding: 0.5rem;
  background: rgba(76, 175, 80, 0.1);
  border-radius: 4px;
  border: 1px solid rgba(76, 175, 80, 0.3);
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
</style>
