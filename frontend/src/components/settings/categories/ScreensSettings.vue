<!-- frontend/src/components/settings/categories/ScreensSettings.vue -->
<template>
  <ScreensLayout :detail="Boolean(selection)" :narrow="narrow" data-test="screens-category">
    <template #list>
      <div data-test="screens-list">
        <SettingsSection id="screens-list" title="Screens" :title-hidden="phoneNavOn">
          <template #action>
            <Button
              data-test="add-screen-btn"
              :aria-expanded="addOpen ? 'true' : 'false'"
              @click="addOpen = !addOpen"
            >
              {{ addOpen ? "Hide instructions" : "+ Add a screen" }}
            </Button>
          </template>
          <!-- The section's own intro strip: padded like a row inside the panel. -->
          <template v-if="removedScreenNote || countLine" #description>
            <InlineNote v-if="removedScreenNote" tone="warn" data-test="screen-removed-note">
              That screen was removed.
            </InlineNote>
            <InlineNote v-if="countLine" :tone="countLine.tone" data-test="screens-count-line">
              {{ countLine.text }}
            </InlineNote>
          </template>
          <EmptyState
            v-if="kiosks.length === 0"
            compact
            class="screens-empty"
            data-test="screens-empty"
            :icon="mdiMonitorDashboard"
            title="No screens have connected yet"
            help="A screen shows up here once it is set up as a kiosk: a Raspberry Pi installed with the command under “Add a screen”, or any browser that opens the dashboard with ?kiosk=<name> in its address."
          />
          <AddKioskPanel
            v-if="addOpen"
            :time-format="config.timeFormat || '24h'"
            :timezone="config.timezone || null"
          />
          <SettingRow
            v-if="agentKiosks.length > 0"
            class="kiosk-software"
            label="Kiosk software"
            data-test="kiosk-software-summary"
          >
            <template #description>
              <InlineNote data-test="kiosk-software-state">
                <template v-if="manifestChecking">Checking for updates…</template>
                <template v-else-if="availableVersion == null">
                  Couldn't check for kiosk updates. The kiosks keep working.
                </template>
                <template v-else-if="updatingKiosks.length > 0">{{ updatingCopy }}</template>
                <template v-else-if="blocked.length > 0 && behind.length === 0">
                  No kiosk can be updated right now.
                  {{ blocked.length }} {{ blocked.length === 1 ? "needs" : "need" }} a newer OS
                  first.
                </template>
                <template v-else-if="behind.length === 0">
                  All kiosks are up to date ({{ shortVersion(availableVersion) }}).
                </template>
                <template v-else>
                  {{ behindCopy }}
                  {{ shortVersion(availableVersion) }}.
                </template>
              </InlineNote>
            </template>
            <Button
              v-if="manifestChecking === false && availableVersion == null"
              data-test="kiosk-software-retry"
              @click="checkManifest"
            >
              Try again
            </Button>
            <Button
              v-else-if="behind.length > 0"
              data-test="kiosk-software-update-all"
              variant="primary"
              :disabled="updatingKiosks.length > 0"
              @click="updateAll"
            >
              {{ updatingKiosks.length > 0 ? "Updating…" : "Update all" }}
            </Button>
          </SettingRow>

          <div class="screens-list-items">
            <!-- The Default is a screen too, edited on its own page (§2). -->
            <ListRow
              class="screen-card screen-card--default"
              :name="'Default'"
              :selected="defaultOpen"
              :chevron="phoneNavOn"
              data-test="screen-default-card"
              role="button"
              tabindex="0"
              @click="openDefault"
              @keydown.enter="openDefault"
              @keydown.space.prevent="openDefault"
            >
              <template #lead>
                <PageThumbnail
                  :page="startPage(null)"
                  :orientation="orientationFor(null)"
                  data-test="all-screens-thumbnail"
                />
              </template>
              <template #meta>
                <InlineNote>
                  Used by new screens and by browsers that aren't set up as a screen
                </InlineNote>
                <InlineNote data-test="default-summary">{{ defaultSummary }}</InlineNote>
              </template>
            </ListRow>

            <ListRow
              v-for="k in kiosks"
              :key="k.id"
              class="screen-card"
              :name="screenLabel(k)"
              :selected="k.id === selectedId"
              :chevron="phoneNavOn"
              data-test="screen-card"
              role="button"
              tabindex="0"
              @click="select(k.id)"
              @keydown.enter="select(k.id)"
              @keydown.space.prevent="select(k.id)"
            >
              <template #lead>
                <PageThumbnail
                  :page="startPage(k)"
                  :orientation="orientationFor(k)"
                  :aria-label="`${screenLabel(k)} start page`"
                />
              </template>
              <template #meta>
                <InlineNote data-test="screen-id">{{ k.id }}</InlineNote>
                <InlineNote data-test="screen-summary">{{ summaryFor(k) }}</InlineNote>
                <InlineNote data-test="screen-last-seen">
                  {{ k.lastSeen ? `Last seen ${relativeTime(k.lastSeen)}` : "Never seen" }}
                </InlineNote>
                <InlineNote
                  v-if="changedSettingCount(k.overrides) > 0"
                  data-test="screen-changed-count"
                >
                  {{ changedSettingCount(k.overrides) }}
                  {{ changedSettingCount(k.overrides) === 1 ? "setting" : "settings" }} changed
                </InlineNote>
                <InlineNote
                  v-if="softwareLine(k)"
                  :tone="softwareTone(k)"
                  data-test="kiosk-version-line"
                >
                  {{ softwareLine(k) }}
                </InlineNote>
                <InlineNote
                  v-if="pairingLine(k)"
                  :tone="pairingLine(k).tone"
                  data-test="screen-pairing-line"
                >
                  {{ pairingLine(k).text }}
                </InlineNote>
              </template>
              <template #actions>
                <Tag data-test="screen-status" :tone="isOnline(k) ? 'ok' : 'neutral'">
                  {{ isOnline(k) ? "Online" : "Offline" }}
                </Tag>
                <Tag
                  v-if="isPending(k)"
                  tone="warn"
                  data-test="kiosk-pending-badge"
                  role="img"
                  :aria-label="`${screenLabel(k)}: offline, display settings waiting`"
                  title="Offline. It will apply the new display settings when it's back."
                  :icon="mdiAlert"
                />
              </template>
            </ListRow>

            <!-- Waiting to be paired (§3.3): a live pending pairing for an id
                 that has no row yet. Not a button: there is no page to open. -->
            <ListRow
              v-for="entry in waitingPairings"
              :key="`waiting-${entry.kioskId}`"
              class="screen-card screen-card--waiting"
              :name="entry.hostname || entry.kioskId"
              data-test="screen-waiting-row"
            >
              <template #lead>
                <PageThumbnail placeholder data-test="waiting-thumbnail" />
              </template>
              <template #meta>
                <InlineNote>
                  Waiting to be paired. Type the code it shows in Pair a screen.
                </InlineNote>
              </template>
            </ListRow>

            <!-- Only on a browser that is not itself a set-up screen (§2). -->
            <ListRow
              v-if="!kioskId"
              class="screen-card screen-card--browser"
              name="This browser"
              :selected="browserOpen"
              :chevron="phoneNavOn"
              data-test="screen-browser-card"
              role="button"
              tabindex="0"
              @click="openBrowser"
              @keydown.enter="openBrowser"
              @keydown.space.prevent="openBrowser"
            >
              <template #meta>
                <InlineNote data-test="browser-summary">{{ browserSummary }}</InlineNote>
              </template>
            </ListRow>
          </div>
        </SettingsSection>

        <!-- §4. One place to type a code, and the household choice. Shown
             whenever the list is, even before the first screen exists. -->
        <SettingsSection id="screens-pairing" title="Pairing">
          <SettingRow
            stacked
            label="Pair a screen"
            description="Type the code shown at the bottom of the screen."
          >
            <form class="screens-pair-form" data-test="pair-form" @submit.prevent="submitPair">
              <TextField
                ref="pairField"
                v-model="pairCode"
                label="Code"
                input-test="pair-code-input"
                autocapitalize="characters"
                autocomplete="off"
                enterkeyhint="go"
                maxlength="12"
                :readonly="pairingBusy"
                :invalid="pairCodeInvalid"
                @update:model-value="onPairCodeInput"
              />
              <Button
                variant="primary"
                type="submit"
                data-test="pair-screen-btn"
                :loading="pairingBusy"
                loading-label="Pairing…"
                :aria-disabled="pairCooldown ? 'true' : undefined"
              >
                Pair
              </Button>
            </form>
            <InlineNote
              v-if="pairResult.text"
              :tone="pairResult.tone"
              class="screens-pair-result"
              data-test="pair-result"
              role="status"
              aria-live="polite"
            >
              {{ pairResult.text }}
              <template v-if="pairResult.target" #action>
                <Button variant="link" size="sm" data-test="open-paired-screen" @click="openPaired">
                  Open {{ pairResult.target.displayName }}
                </Button>
              </template>
            </InlineNote>
          </SettingRow>
          <SettingRow
            label="Only paired screens"
            description="Unpaired screens still show the dashboard, but can't report in or follow home automation."
          >
            <ToggleSwitch
              :model-value="pairingRequired"
              :disabled="pairingModeSaving"
              aria-label="Only paired screens"
              data-test="only-paired-toggle"
              @update:model-value="onPairingModeToggle"
            />
          </SettingRow>
          <InlineNote
            v-if="pairingModeError"
            class="screens-saved"
            tone="err"
            data-test="pairing-mode-error"
            role="status"
          >
            {{ pairingModeError }}
          </InlineNote>
        </SettingsSection>
      </div>
    </template>

    <Button
      v-if="!phoneNavOn"
      variant="link"
      size="sm"
      data-test="screens-back"
      @click="closeDetail"
    >
      ‹ Screens
    </Button>

    <DefaultScreenSettings
      v-if="defaultOpen"
      :config="config"
      @update:config="patch => emit('update:config', patch)"
      @open-screen="select"
    />
    <ThisBrowserSettings v-else-if="browserOpen" :config="config" @changed="refreshBrowserCount" />

    <template v-else-if="selectedKiosk">
      <KioskStatusHeader
        v-if="!phoneSectionOpen"
        :kiosk-id="screenLabel(selectedKiosk)"
        :online="isOnline(selectedKiosk)"
        :last-seen-label="relativeTime(selectedKiosk.lastSeen)"
        :applied-version="selectedKiosk.lastAppliedVersion ?? null"
        :desired-version="desiredVersions[selectedId] ?? null"
        :display-stack="selectedKiosk.displayStack ?? null"
        :agent-version="selectedKiosk.agentVersion ?? null"
        :wifi-power-save="selectedKiosk.wifiPowerSave ?? null"
      />

      <ChangedHereLine v-if="!phoneSectionOpen" :items="changedHereItems" />
      <ScreenSectionIndex :sections="sectionIndex" :trailing="phoneTrailingSections" />

      <SettingsSection id="screen-name" title="Name">
        <SettingRow label="Name" description="Shown in this screen's clock bar.">
          <TextField
            input-test="screen-name-input"
            hide-label
            label="Name"
            :model-value="nameDraft"
            :placeholder="namePlaceholder"
            @update:model-value="v => (nameDraft = v)"
            @blur="setName(nameDraft)"
          />
        </SettingRow>
        <InlineNote
          v-if="nameMsg.text"
          class="screens-saved"
          :tone="nameMsg.tone"
          role="status"
          aria-live="polite"
        >
          {{ nameMsg.text }}
        </InlineNote>
      </SettingsSection>

      <SettingsSection id="screen-pages" title="Pages">
        <SettingRow label="Pages shown" :id="rowAnchorId('availableScreens')">
          <template #description>
            <span>Pages are shared by all screens. Choose which ones this screen shows.</span>
            <InlineNote v-if="pages.length === 1" data-test="only-one-page">
              Only one page so far.
            </InlineNote>
            <ScopeLine
              :overridden="availableOverridden"
              reset-test="reset-screens-shown"
              @reset="resetAvailable"
            />
          </template>
          <Button data-test="edit-pages-btn" @click="editorOpen = true">Edit pages</Button>
        </SettingRow>
        <ListRow
          v-for="page in pages"
          :key="page.id"
          :name="page.name"
          :disabled="!showsPage(page.id)"
          data-test="screen-page-row"
          class="screen-page"
        >
          <template #lead>
            <PageThumbnail
              :page="page"
              :orientation="effOrientation"
              size="page"
              data-test="screen-page-thumbnail"
            />
          </template>
          <template #meta>
            <InlineNote v-if="!showsPage(page.id)">Not shown here</InlineNote>
            <InlineNote v-else>{{ alsoOnLabel(selectedKiosk, page.id) }}</InlineNote>
          </template>
          <template #actions>
            <ToggleSwitch
              :model-value="showsPage(page.id)"
              :aria-label="`Show ${page.name} on this screen`"
              @update:model-value="value => togglePage(page.id, value)"
            />
            <Button
              size="sm"
              :variant="effDefault === page.id ? 'primary' : 'secondary'"
              :aria-pressed="effDefault === page.id ? 'true' : 'false'"
              :icon="effDefault === page.id ? mdiCheck : undefined"
              :disabled="!showsPage(page.id)"
              :aria-label="`Start here: ${page.name}`"
              @click="setDefault(page.id)"
            >
              Start here
            </Button>
          </template>
        </ListRow>
        <SettingRow label="Start page" :id="rowAnchorId('defaultScreenId')">
          <template #description>
            <ScopeLine
              :overridden="defaultOverridden"
              reset-test="reset-default-screen"
              @reset="resetDefaultScreen"
            />
          </template>
        </SettingRow>
        <InlineNote
          v-if="pagesMsg.text"
          class="screens-saved"
          :tone="pagesMsg.tone"
          role="status"
          aria-live="polite"
        >
          {{ pagesMsg.text }}
        </InlineNote>
      </SettingsSection>

      <SettingsSection id="screen-look" title="Look">
        <template v-for="descriptor in visibleLookDescriptors" :key="descriptor.key">
          <ScreenSettingRow
            :descriptor="descriptor"
            :id="rowAnchorId(descriptor.key)"
            :value="look[descriptor.key]"
            :overridden="Boolean(lookOverridden[descriptor.key])"
            :note="lookNote.key === descriptor.key ? lookNote.text : ''"
            @set="value => setLook(descriptor.key, value)"
            @reset="() => resetLook(descriptor.key)"
          />
        </template>
        <InlineNote
          v-if="lookMsg.text"
          class="screens-saved"
          :tone="lookMsg.tone"
          role="status"
          aria-live="polite"
        >
          {{ lookMsg.text }}
        </InlineNote>
      </SettingsSection>

      <SettingsSection id="screen-display" title="Display">
        <SettingRow label="Orientation" :id="rowAnchorId('orientation')">
          <template #description>
            <ScopeLine
              :overridden="orientationOverridden"
              reset-test="reset-orientation-row"
              @reset="resetOrientationRow"
            />
          </template>
          <SegmentedControl
            :model-value="effOrientation"
            aria-label="Orientation"
            :options="[
              { value: 'landscape', label: 'Landscape' },
              { value: 'portrait', label: 'Portrait' },
            ]"
            @update:model-value="setOrientation"
          />
        </SettingRow>
        <SettingRow label="Upside down" :id="rowAnchorId('orientationFlipped')">
          <template #description>
            <ScopeLine :overridden="flipOverridden" reset-test="reset-flip" @reset="resetFlip" />
          </template>
          <ToggleSwitch
            :model-value="effFlipped"
            aria-label="Upside down"
            @update:model-value="setFlipped"
          />
        </SettingRow>
        <SettingRow label="Rotate the screen output" :id="rowAnchorId('applyDisplayRotation')">
          <template #description>
            <ScopeLine
              :overridden="applyOverridden"
              reset-test="reset-apply-rotation"
              @reset="resetApply"
            />
          </template>
          <ToggleSwitch
            :model-value="effApply"
            aria-label="Rotate the screen output"
            @update:model-value="setApply"
          />
        </SettingRow>
        <template v-for="descriptor in displayRows" :key="descriptor.key">
          <ScreenSettingRow
            :descriptor="descriptor"
            :id="rowAnchorId(descriptor.key)"
            :value="displayRowValues[descriptor.key]"
            :overridden="Boolean(displayRowValuesOverridden[descriptor.key])"
            @set="value => setDisplayRow(descriptor.key, value)"
            @reset="() => resetDisplayRow(descriptor.key)"
          />
        </template>
        <Card data-test="screen-live-preview">
          <PageThumbnail
            :page="selectedStartPage"
            :orientation="effOrientation"
            size="live"
            data-test="screen-live-thumbnail"
          />
          <InlineNote>{{ previewCaption }}</InlineNote>
        </Card>
        <InlineNote
          v-if="displayMsg.text"
          class="screens-saved"
          :tone="displayMsg.tone"
          role="status"
          aria-live="polite"
        >
          {{ displayMsg.text }}
        </InlineNote>
      </SettingsSection>

      <SettingsSection id="screen-effects" title="Effects & focus">
        <template v-for="descriptor in visibleEffectsDescriptors" :key="descriptor.key">
          <ScreenSettingRow
            :descriptor="descriptor"
            :id="rowAnchorId(descriptor.key)"
            :value="effects[descriptor.key]"
            :overridden="Boolean(effectsOverridden[descriptor.key])"
            :auto-note="descriptor.key === 'effectsLevel' ? effectsAutoCopy : ''"
            @set="value => setEffects(descriptor.key, value)"
            @reset="() => resetEffects(descriptor.key)"
          />
        </template>
        <InlineNote
          v-if="effectsMsg.text"
          class="screens-saved"
          :tone="effectsMsg.tone"
          role="status"
          aria-live="polite"
        >
          {{ effectsMsg.text }}
        </InlineNote>
      </SettingsSection>

      <SettingsSection id="screen-controls" title="Controls">
        <template v-for="descriptor in visibleControlDescriptors" :key="descriptor.key">
          <ScreenSettingRow
            :descriptor="descriptor"
            :id="rowAnchorId(descriptor.key)"
            :value="controls[descriptor.key]"
            :overridden="Boolean(controlsOverridden[descriptor.key])"
            @set="value => setControl(descriptor.key, value)"
            @reset="() => resetControl(descriptor.key)"
          />
        </template>
        <InlineNote
          v-if="controlsMsg.text"
          class="screens-saved"
          :tone="controlsMsg.tone"
          role="status"
          aria-live="polite"
        >
          {{ controlsMsg.text }}
        </InlineNote>
      </SettingsSection>

      <SettingsSection id="screen-power" title="Power">
        <SettingRow stacked label="Screen power" :id="rowAnchorId('screenPower')">
          <template #description>
            <span data-test="screen-power-hint">{{ screenPowerHint }}</span>
            <template v-if="effScreenPower === 'external'">
              <InlineNote data-test="screen-power-keys-note">
                It needs an API key that can turn screens on and off.
                <template #action>
                  <Button
                    variant="link"
                    size="sm"
                    data-test="screen-power-keys"
                    @click="openApiKeys"
                  >
                    Open API keys
                  </Button>
                </template>
              </InlineNote>
              <InlineNote v-if="!onKiosk" data-test="screen-power-guide-note">
                The home automation guide shows the steps for Homey and Home Assistant.
                <template #action>
                  <Button
                    variant="link"
                    size="sm"
                    data-test="screen-power-guide"
                    @click="openGuide"
                  >
                    Open the guide
                  </Button>
                </template>
              </InlineNote>
            </template>
            <ScopeLine
              :overridden="screenPowerOverridden"
              reset-test="reset-screen-power"
              @reset="resetScreenPower"
            />
          </template>
          <SegmentedControl
            :model-value="effScreenPower"
            aria-label="Screen power"
            :options="SCREEN_POWER_OPTIONS"
            @update:model-value="setScreenPowerMode"
          />
        </SettingRow>
        <DisplayScheduleGrid
          v-if="effScreenPower === 'schedule'"
          :id="rowAnchorId('displaySchedule')"
          :model-value="effSchedule || []"
          :week-start="config.weekStartDay ?? 1"
          :time-format="config.timeFormat || '24h'"
          show-scope
          :overridden="scheduleOverridden"
          reset-test="reset-daily-schedule"
          @update:model-value="setSchedule"
          @reset="resetDailySchedule"
        />
        <SettingRow v-if="effScreenPower !== 'always_on'" label="Screen now">
          <template #description>
            <InlineNote v-if="presenceHidden" data-test="screen-now-hidden">
              Sign in as admin to see whether this screen is on or off, and who set it.
            </InlineNote>
            <template v-else>
              <InlineNote data-test="screen-now-state">
                {{ powerStateCopy }}
              </InlineNote>
              <InlineNote v-if="untilCopy" data-test="screen-now-until">
                {{ untilCopy }}
              </InlineNote>
            </template>
            <InlineNote v-if="unpairedPowerNote" tone="warn" data-test="screen-now-unpaired">
              {{ unpairedPowerNote }}
              <template v-if="effScreenPower === 'external'" #action>
                <Button variant="link" size="sm" data-test="screen-now-pair" @click="goToPairField">
                  Pair a screen
                </Button>
              </template>
            </InlineNote>
            <InlineNote v-if="offlineCopy" data-test="screen-now-offline">
              {{ offlineCopy }}
            </InlineNote>
            <InlineNote v-if="dimmingSeconds !== null" data-test="screen-now-dimming">
              Dimming… then off · about {{ dimmingSeconds }} s
            </InlineNote>
          </template>
          <Button
            ref="powerOnButton"
            data-test="screen-now-on"
            :loading="powerBusy && powerDirection === 'on'"
            loading-label="Turning on…"
            :aria-disabled="powerBusy || (!presenceHidden && desiredOnNow) ? 'true' : undefined"
            @click="setScreenNow('on')"
          >
            {{ powerOnLabel }}
          </Button>
          <Button
            ref="powerOffButton"
            data-test="screen-now-off"
            :loading="powerBusy && powerDirection === 'off'"
            loading-label="Turning off…"
            :aria-disabled="powerBusy || (!presenceHidden && !desiredOnNow) ? 'true' : undefined"
            @click="setScreenNow('off')"
          >
            {{ powerOffLabel }}
          </Button>
          <Button
            v-if="showBackToSchedule"
            variant="link"
            data-test="screen-now-follow"
            @click="followSchedule"
          >
            Back to schedule
          </Button>
        </SettingRow>
        <SettingRow label="Turn off when idle" :id="rowAnchorId('displayTimeout')">
          <template #description>
            <ScopeLine
              :overridden="idleOverridden"
              reset-test="reset-idle-timeout"
              @reset="resetIdle"
            />
          </template>
          <SelectPill
            :model-value="idleValue"
            :options="idleOptions"
            aria-label="Turn off when idle"
            @update:model-value="setIdle"
          />
        </SettingRow>
        <BrightnessGroup
          :kiosk="selectedKiosk"
          :overrides="overrides"
          :screen-name="selectedName"
          :asleep="!presenceHidden && !desiredOnNow"
          :online="selectedKiosk ? isOnline(selectedKiosk) : true"
          @patch="patchBrightness"
          @open-check="openCheck"
        />
        <DisplayCheckDialog
          v-model="checkOpen"
          :kiosk-id="selectedId || ''"
          :screen-name="selectedName"
          :asleep="!presenceHidden && !desiredOnNow"
          :on-panel="Boolean(kioskId) && kioskId === selectedId"
          :overrides="overrides"
          :save-patch="patchBrightness"
          @patch="patchBrightness"
          @turn-on="setScreenNow('on')"
        />
        <InlineNote
          v-if="powerMsg.text"
          class="screens-saved"
          data-test="screen-now-message"
          :tone="powerMsg.tone"
          role="status"
          aria-live="polite"
        >
          {{ powerMsg.text }}
        </InlineNote>
      </SettingsSection>

      <SettingsSection id="screen-touch" title="Touch & keyboard">
        <SettingRow label="Touchscreen" :id="rowAnchorId('touchControls')">
          <template #description>
            <ScopeLine
              :overridden="touchOverridden"
              reset-test="reset-touchscreen"
              @reset="resetTouch"
            />
          </template>
          <SegmentedControl
            :model-value="effTouch"
            aria-label="Touchscreen"
            :options="[
              { value: 'auto', label: 'Auto' },
              { value: 'on', label: 'On' },
              { value: 'off', label: 'Off' },
            ]"
            @update:model-value="setTouch"
          />
        </SettingRow>
        <SettingRow label="On-screen keyboard" :id="rowAnchorId('onScreenKeyboard')">
          <template #description>
            <ScopeLine :overridden="oskOverridden" reset-test="osk-use-shared" @reset="resetOsk" />
          </template>
          <SegmentedControl
            :model-value="effOsk"
            aria-label="On-screen keyboard"
            :options="[
              { value: 'auto', label: 'Auto' },
              { value: 'on', label: 'Always' },
              { value: 'off', label: 'Never' },
            ]"
            @update:model-value="setOsk"
          />
        </SettingRow>
        <InlineNote
          v-if="touchMsg.text"
          class="screens-saved"
          :tone="touchMsg.tone"
          role="status"
          aria-live="polite"
        >
          {{ touchMsg.text }}
        </InlineNote>
      </SettingsSection>

      <!-- The button-press label is this screen's; how long it stays, the
           bindings and the reboot keys are the same on every screen. -->
      <SettingsSection id="screen-remote" title="Remote & keys">
        <template v-for="descriptor in visibleRemoteDescriptors" :key="descriptor.key">
          <ScreenSettingRow
            :id="rowAnchorId(descriptor.key)"
            :descriptor="descriptor"
            :value="remote[descriptor.key]"
            :overridden="Boolean(remoteOverridden[descriptor.key])"
            @set="value => setRemote(descriptor.key, value)"
            @reset="() => resetRemote(descriptor.key)"
          />
        </template>
        <SettingRow
          label="Shared by every screen"
          description="Hide label after, button bindings and the reboot keys."
          data-test="screen-remote-shared"
        >
          <Button data-test="open-default-remote" @click="openDefaultRemote">Open Default</Button>
        </SettingRow>
        <InlineNote
          v-if="remoteMsg.text"
          class="screens-saved"
          :tone="remoteMsg.tone"
          role="status"
          aria-live="polite"
        >
          {{ remoteMsg.text }}
        </InlineNote>
      </SettingsSection>

      <SettingsSection id="screen-behaviour" title="Behaviour">
        <ScreenSettingRow
          v-for="descriptor in visibleBehaviourDescriptors"
          :key="descriptor.key"
          :descriptor="descriptor"
          :id="rowAnchorId(descriptor.key)"
          :value="behaviour[descriptor.key]"
          :overridden="Boolean(behaviourOverridden[descriptor.key])"
          @set="value => setBehaviour(descriptor.key, value)"
          @reset="() => resetBehaviour(descriptor.key)"
        />
        <InlineNote
          v-if="behaviourMsg.text"
          class="screens-saved"
          :tone="behaviourMsg.tone"
          role="status"
          aria-live="polite"
        >
          {{ behaviourMsg.text }}
        </InlineNote>
      </SettingsSection>

      <SettingsSection id="screen-pairing" title="Pairing">
        <SettingRow :label="screenPairing.label">
          <template #description>
            <InlineNote data-test="screen-pairing-state">
              {{ screenPairing.description }}
            </InlineNote>
            <InlineNote
              v-if="!pairingState.paired && pairingRequired"
              tone="warn"
              data-test="screen-pairing-required"
            >
              Only paired screens is on, so until it is paired this screen can't report in or follow
              home automation.
            </InlineNote>
          </template>
          <Button
            v-if="pairingState.paired"
            ref="unpairButton"
            data-test="unpair-screen-btn"
            :loading="unpairBusy"
            loading-label="Unpairing…"
            @click="askUnpair"
          >
            Unpair
          </Button>
          <Button
            v-else-if="pairingState.kind === 'can-pair'"
            ref="pairScreenButton"
            data-test="pair-screen-link"
            @click="goToPairField"
          >
            Pair a screen
          </Button>
          <Button
            v-else
            data-test="pairing-update-btn"
            :loading="selectedKiosk?.agentUpdateRequested"
            loading-label="Updating…"
            @click="onUpdate(selectedId)"
          >
            <template v-if="selectedKiosk?.agentUpdateRequested">Updating…</template>
            <template v-else-if="hasUpdateError(selectedKiosk)">Try again</template>
            <template v-else>Update</template>
          </Button>
        </SettingRow>
        <InlineNote
          v-if="unpairResult.text"
          class="screens-saved"
          :tone="unpairResult.tone"
          data-test="unpair-result"
          role="status"
          aria-live="polite"
        >
          {{ unpairResult.text }}
        </InlineNote>
      </SettingsSection>

      <SettingsSection id="screen-software" title="Software">
        <SettingRow
          v-if="selectedKiosk.agentVersion != null"
          label="Kiosk software"
          data-test="screen-software-row"
        >
          <template #description>
            <InlineNote data-test="screen-software-state">
              {{ softwareLine(selectedKiosk) }}
            </InlineNote>
            <InlineNote v-if="isUpdateBlocked(selectedKiosk)">
              Reinstall this kiosk with a current Raspberry Pi OS, then update.
            </InlineNote>
          </template>
          <Button
            v-if="showUpdateButton(selectedKiosk) || selectedKiosk.agentUpdateRequested"
            data-test="kiosk-update-btn"
            :loading="selectedKiosk.agentUpdateRequested"
            loading-label="Updating…"
            @click="onUpdate(selectedId)"
          >
            <template v-if="selectedKiosk.agentUpdateRequested">Updating…</template>
            <template v-else-if="hasUpdateError(selectedKiosk)">Try again</template>
            <template v-else>Update</template>
          </Button>
        </SettingRow>
        <SettingRow v-else label="Kiosk software" data-test="screen-software-empty">
          <template #description>
            <InlineNote>
              This screen runs in a browser, so there is no kiosk software to update.
            </InlineNote>
          </template>
        </SettingRow>
      </SettingsSection>

      <SettingsSection id="screen-remove" title="Remove screen">
        <SettingRow label="Remove this screen">
          <template #description>
            <InlineNote>
              For a screen that has been taken away. Its own settings and calibration are deleted.
            </InlineNote>
            <InlineNote v-if="removeBlockedReason" data-test="remove-screen-reason">
              {{ removeBlockedReason }}
            </InlineNote>
          </template>
          <Button
            variant="danger"
            data-test="remove-screen-btn"
            :disabled="Boolean(removeBlockedReason)"
            @click="askRemove"
          >
            Remove screen
          </Button>
        </SettingRow>
        <InlineNote
          v-if="removeMsg.text"
          class="screens-saved"
          :tone="removeMsg.tone"
          role="status"
          aria-live="polite"
        >
          {{ removeMsg.text }}
        </InlineNote>
      </SettingsSection>

      <!-- Page footer: only when this screen differs from Default (§4). -->
      <Card v-if="selectedChangedCount > 0" data-test="screen-override-footer">
        <InlineNote>
          {{ footerCopy }}
          <template #action>
            <Button data-test="reset-everything" @click="askResetEverything">
              Reset everything to default
            </Button>
            <Button variant="ghost" data-test="use-as-default" @click="askUseAsDefault">
              Use these as the default
            </Button>
          </template>
        </InlineNote>
        <InlineNote v-if="footerMsg.text" :tone="footerMsg.tone">{{ footerMsg.text }}</InlineNote>
      </Card>

      <ScreenRegionEditor
        :config="config"
        :open="editorOpen"
        :initial-preview-kiosk="selectedId"
        @update:config="patch => emit('update:config', patch)"
        @close="editorOpen = false"
      />
    </template>
  </ScreensLayout>

  <ConfirmModal
    :show="confirm.show"
    :title="confirm.title"
    :message="confirm.message"
    :confirm-text="confirm.confirmText"
    :danger="confirm.danger !== false"
    @confirm="onConfirm"
    @cancel="confirm.show = false"
  />
</template>

<script setup>
import {
  computed,
  inject,
  nextTick,
  onMounted,
  onUnmounted,
  provide,
  reactive,
  ref,
  watch,
} from "vue";
import { useRoute, useRouter } from "vue-router";
import { SECTION_FOCUS_INDEX, useSettingsPhoneNav } from "@/composables/useSettingsPhoneNav";
import { mdiAlert, mdiCheck } from "@mdi/js";
import { useKiosksStore } from "@/stores/kiosks";
import { useAuthStore } from "@/stores/auth";
import { useNotificationsStore } from "@/stores/notifications";
import { useIntervalWhenVisible } from "@/composables/useIntervalWhenVisible";
import {
  hasUpdateError,
  isUpdateBlocked,
  displayStackLabel,
  isVersionBehind,
  kiosksBehind,
  kiosksBlocked,
  shortVersion,
} from "@/utils/kioskSoftware";
import { normalizeDashboardScreens } from "@/utils/layout";
import { effectiveAvailablePages } from "@/utils/availablePages";
import { getKioskId } from "@/utils/kioskId";
import { screenLabel, screenLabelFallback } from "@/utils/screenLabel";
import { joinNames } from "@/utils/screenOverrides";
import {
  HOME_AUTOMATION_GUIDE_URL,
  SCREEN_POWER_HINTS,
  SCREEN_POWER_OPTIONS,
  effectiveScreenMode,
  effectiveTimeZone,
  formatUntil,
  formatWhen,
  keyNameLabel,
  nextScheduleBoundary,
  scheduleDesiredOn,
} from "@/utils/screenPower";
import {
  changedSettingCount,
  changedSettingRows,
  descriptorsForSection,
  formatSettingList,
  hasOwnSettings,
  rowAnchorId,
  useAsDefaultPatch,
  visibleDescriptors,
  withoutAllOverrides,
  withoutPromotedSettings,
} from "@/utils/screenOverrides";
import { mdiMonitorDashboard } from "@mdi/js";
import Button from "@/components/ui/Button.vue";
import Card from "@/components/ui/Card.vue";
import EmptyState from "@/components/ui/EmptyState.vue";
import InlineNote from "@/components/ui/InlineNote.vue";
import ListRow from "@/components/ui/ListRow.vue";
import ScopeLine from "@/components/ui/ScopeLine.vue";
import BrightnessGroup from "@/components/settings/shared/BrightnessGroup.vue";
import DisplayCheckDialog from "@/components/settings/shared/DisplayCheckDialog.vue";
import { clampBrightness, dimSeconds, firstBrightness } from "@/utils/brightness";
import { scrollBehavior } from "@/utils/scrollIntoViewMotion";
import SegmentedControl from "@/components/ui/SegmentedControl.vue";
import Tag from "@/components/ui/Tag.vue";
import TextField from "@/components/ui/TextField.vue";
import ToggleSwitch from "@/components/ui/ToggleSwitch.vue";
import SelectPill from "@/components/ui/SelectPill.vue";
import SettingsSection from "@/components/settings/shell/SettingsSection.vue";
import SettingRow from "@/components/settings/shell/SettingRow.vue";
import DisplayScheduleGrid from "@/components/settings/shared/DisplayScheduleGrid.vue";
import AddKioskPanel from "@/components/settings/shared/AddKioskPanel.vue";
import KioskStatusHeader from "@/components/settings/shared/KioskStatusHeader.vue";
import PageThumbnail from "@/components/settings/shared/PageThumbnail.vue";
import ScreenRegionEditor from "@/components/settings/shared/ScreenRegionEditor.vue";
import ScreenSectionIndex from "@/components/settings/shared/ScreenSectionIndex.vue";
import ScreensLayout from "@/components/settings/shared/ScreensLayout.vue";
import ConfirmModal from "@/components/ui/ConfirmModal.vue";
import DefaultScreenSettings from "@/components/settings/categories/DefaultScreenSettings.vue";
import ThisBrowserSettings from "@/components/settings/categories/ThisBrowserSettings.vue";
import ScreenSettingRow from "@/components/settings/shared/ScreenSettingRow.vue";
import ChangedHereLine from "@/components/settings/shared/ChangedHereLine.vue";
import { effectsLevelLabel, resolveEffectsLevel } from "@/utils/effectsLevel";
import { flushKioskOverridesQueues, kioskOverridesQueue } from "@/utils/kioskOverridesQueue";
import { friendlyError } from "@/utils/friendlyError";
import { formatKeyDate } from "@/utils/apiKeyFormat";

const props = defineProps({
  config: { type: Object, required: true },
  // A ?setting= deep link that lands inside the Default page (§8). The old
  // All-screens destinations keep working: they open Default at that section.
  initialSection: { type: String, default: null },
  // The destination id of that deep link. Section ids alone cannot say which
  // page to open: Default and a screen's own page share them, and the remote's
  // per-screen row (screen-remote) and its shared rows (device-notifications,
  // device-reboot) are all in "device-remote". The destination distinguishes
  // them.
  initialSetting: { type: String, default: null },
});
const emit = defineEmits(["update:config"]);

const store = useKiosksStore();
const auth = useAuthStore();
const notifications = useNotificationsStore();
const kiosks = computed(() => store.kiosks);
// A browser that is itself a set-up screen has no "This browser" card: its
// settings are that screen's.
const kioskId = getKioskId();
const addOpen = ref(false);
const availableVersion = ref(null);
const manifestChecking = ref(true);
const desiredVersions = ref({});
const editorOpen = ref(false);

// --- which page is open ----------------------------------------------------
// null (the list) · "default" · "browser" · a screen id on a kiosk selection.
// A deep link opens a page depending on where its destination lives: the
// per-screen Look, Effects and Controls sections, and the screen's own remote
// row (screen-remote), open the kiosk's own page; everything else opens
// Default, including the remote's shared rows (device-notifications,
// device-reboot), which are the same on every screen and live on Default. On a
// plain browser every destination opens Default. Default calls the remote
// section device-remote while a screen's own page calls it screen-remote, so
// the per-screen row maps to that id on a kiosk.
const INITIAL_PER_SCREEN_SECTIONS = new Set(["screen-look", "screen-effects", "screen-controls"]);
const PER_SCREEN_DESTINATIONS = new Set(["screen-remote"]);
const PER_SCREEN_SECTION_IDS = { "device-remote": "screen-remote" };
const DEFAULT_SECTION_IDS = new Set([
  "layout",
  "device-power",
  "device-keyboard",
  "device-remote",
  "device-behaviour",
  "screen-look",
  "screen-effects",
  "screen-controls",
]);

// The section index under a screen's header uses the same `section-<id>`
// anchors the deep links scroll to (settings-scope §5).
const sectionIndex = [
  { id: "screen-name", label: "Name" },
  { id: "screen-pages", label: "Pages" },
  { id: "screen-look", label: "Look" },
  { id: "screen-display", label: "Display" },
  { id: "screen-effects", label: "Effects & focus" },
  { id: "screen-controls", label: "Controls" },
  { id: "screen-power", label: "Power" },
  { id: "screen-touch", label: "Touch & keyboard" },
  { id: "screen-remote", label: "Remote & keys" },
  { id: "screen-behaviour", label: "Behaviour" },
  { id: "screen-pairing", label: "Pairing" },
  { id: "screen-software", label: "Software" },
];
const initialOwnScreenId =
  kioskId &&
  (INITIAL_PER_SCREEN_SECTIONS.has(props.initialSection) ||
    PER_SCREEN_DESTINATIONS.has(props.initialSetting))
    ? kioskId
    : null;
// On a kiosk the remote rows live under the screen page's own section id.
const initialSectionId =
  (initialOwnScreenId && PER_SCREEN_SECTION_IDS[props.initialSection]) || props.initialSection;
const selection = ref(
  initialOwnScreenId
    ? { kind: "screen", id: initialOwnScreenId }
    : props.initialSection && DEFAULT_SECTION_IDS.has(props.initialSection)
      ? { kind: "default" }
      : null
);
const defaultOpen = computed(() => selection.value?.kind === "default");
const browserOpen = computed(() => selection.value?.kind === "browser");
const selectedId = computed(() => (selection.value?.kind === "screen" ? selection.value.id : null));

// --- phone Settings: the list, a screen and a section are pages ------------
// On a phone the open screen and section live in the URL
// (?screen=default|browser|<kiosk id>&section=<id>, useSettingsPhoneNav.js) so
// the phone's back gesture steps back through them. Elsewhere nothing changes.
const route = useRoute();
const router = useRouter();
const phoneNav = useSettingsPhoneNav();
const phoneNavOn = computed(() => Boolean(phoneNav?.active.value));
const selectionKey = computed(() =>
  !selection.value
    ? null
    : selection.value.kind === "screen"
      ? selection.value.id
      : selection.value.kind
);
const phoneSection = computed(() =>
  phoneNavOn.value && typeof route.query.section === "string" ? route.query.section : null
);
const phoneSectionOpen = computed(() => Boolean(phoneSection.value));
// "This browser" is one short section: it is shown whole.
provide(
  "settingsSectionFocus",
  computed(() => {
    if (!phoneNavOn.value || !selection.value || selection.value.kind === "browser") return null;
    return phoneSection.value || SECTION_FOCUS_INDEX;
  })
);
const phoneTrailingSections = [{ id: "screen-remove", label: "Remove screen", tone: "danger" }];

// The phone top bar names the open page: the screen, then the section.
const PHONE_SECTION_TITLES = {
  "default-pages": "Pages",
  layout: "Display",
  "device-power": "Power",
  "device-keyboard": "Touch & keyboard",
  "device-remote": "Remote & keys",
  "device-behaviour": "Behaviour",
  "screen-remove": "Remove screen",
};
watch(
  [phoneNavOn, selection, phoneSection, () => kiosks.value],
  () => {
    if (!phoneNavOn.value) return;
    const sel = selection.value;
    let screenTitle = "";
    if (sel?.kind === "default") screenTitle = "Default";
    else if (sel?.kind === "browser") screenTitle = "This browser";
    else if (sel?.kind === "screen") {
      const kiosk = kiosks.value.find(k => k.id === sel.id);
      screenTitle = kiosk ? screenLabel(kiosk) : sel.id;
    }
    phoneNav.setTitle("screen", screenTitle);
    const id = phoneSection.value;
    const label = id
      ? (sectionIndex.find(section => section.id === id)?.label ?? PHONE_SECTION_TITLES[id] ?? "")
      : "";
    phoneNav.setTitle("section", label);
  },
  { immediate: true }
);

// Push the page when the person opens one; the route watcher below applies a
// back gesture. `fromRoute` breaks the loop.
function syncScreenToRoute(key, { replace = false } = {}) {
  if (!phoneNavOn.value) return;
  if ((route.query.screen ?? null) === key) return;
  return phoneNav.open({ screen: key }, { replace });
}
// A ?screen= that names no screen (removed, or an old link): once the list has
// loaded, step up to it and say so, instead of a blank page titled with the id.
// `kiosksFresh` means a list arrived that is fresh enough to call a screen
// removed. A cached list may predate the screen, so it can open a known id
// but not deny one, and a failed load says nothing about the id either.
const kiosksFresh = ref(false);
const removedScreenNote = ref(false);
function applyRouteScreen(key) {
  if (key === undefined || key === selectionKey.value) return;
  if (!key) closeDetail({ fromRoute: true });
  else if (key === "default") openDefault({ fromRoute: true });
  else if (key === "browser") openBrowser({ fromRoute: true });
  else if (kiosks.value.some(k => k.id === key)) select(key, { fromRoute: true });
  else if (!kiosksFresh.value)
    return; // wait for a load that can be trusted to know the screen is gone
  else {
    closeDetail({ fromRoute: true });
    removedScreenNote.value = true;
    const query = { ...route.query };
    delete query.screen;
    delete query.section;
    router.replace({ query });
  }
}
// Not immediate: the page state it resets is declared further down. The first
// sync runs in onMounted.
watch(() => (phoneNavOn.value ? (route.query.screen ?? null) : undefined), applyRouteScreen);
watch(
  () => (phoneNavOn.value ? route.query.screen : null),
  screen => {
    if (screen) removedScreenNote.value = false;
  }
);
async function syncInitialPhoneRoute() {
  if (!phoneNavOn.value) return;
  if (route.query.screen) applyRouteScreen(route.query.screen);
  // A ?setting= deep link (search, the phone hand-off) opened a page before the
  // route knew about it: make it a page, at its section when it names one.
  else if (selectionKey.value) {
    // `category` too: a deep link arrives as ?setting= alone, and without a
    // category the page would read as the phone's category list.
    await phoneNav.open(
      { category: "screens", screen: selectionKey.value, section: initialSectionId || null },
      { replace: true }
    );
  }
}

// The category is two-pane only where there is room for it (kiosk width):
// list 320px beside the detail. On a phone the list hides while a page is open,
// and ‹ Screens brings it back. Kept in JS (not only a media query) so the
// layout mode is testable without a real viewport.
const NARROW_QUERY = "(max-width: 900px)";
const narrow = ref(false);
let narrowMql = null;
const onNarrowChange = event => {
  narrow.value = event.matches;
};
if (typeof window !== "undefined" && typeof window.matchMedia === "function") {
  narrowMql = window.matchMedia(NARROW_QUERY);
  narrow.value = narrowMql.matches;
  if (typeof narrowMql.addEventListener === "function") {
    narrowMql.addEventListener("change", onNarrowChange);
  } else if (typeof narrowMql.addListener === "function") {
    narrowMql.addListener(onNarrowChange);
  }
}

// A note carries its tone beside its words, so changing the copy can never
// change the colour (a "Couldn't…" that no longer starts that way stays red).
const noteRef = () => ref({ text: "", tone: "ok" });
const say = (target, text, tone = "ok") => {
  target.value = { text, tone };
};
const clear = target => {
  target.value = { text: "", tone: "ok" };
};

const nameMsg = noteRef();
const pagesMsg = noteRef();
const lookMsg = noteRef();
const lookNote = ref({ key: "", text: "" });
const displayMsg = noteRef();
const effectsMsg = noteRef();
const controlsMsg = noteRef();
const powerMsg = noteRef();
const touchMsg = noteRef();
const remoteMsg = noteRef();
const behaviourMsg = noteRef();
const footerMsg = noteRef();
const overridesQueue = computed(() =>
  selectedId.value ? kioskOverridesQueue(selectedId.value) : null
);
// Confirmed overrides with this screen's still-pending taps on top.
const overrides = computed(() => overridesQueue.value?.display.value ?? {});

// Browser-only choices that make up "{n} settings just for this browser".
const BROWSER_STORAGE_KEYS = ["calvin-touch-controls", "calvin-osk-mode", "calvin-ui-size"];
const browserOverrideCount = ref(0);
function refreshBrowserCount() {
  try {
    browserOverrideCount.value = BROWSER_STORAGE_KEYS.filter(key => {
      const raw = window.localStorage.getItem(key);
      return raw !== null && raw !== "";
    }).length;
  } catch {
    browserOverrideCount.value = 0;
  }
}
const browserSummary = computed(() => {
  const count = browserOverrideCount.value;
  if (!count) return "Same as Default";
  return `${count} setting${count === 1 ? "" : "s"} just for this browser`;
});

// Browser-only kiosks have no agent; the software rows ignore them entirely.
const agentKiosks = computed(() => kiosks.value.filter(k => k.agentVersion != null));
const behind = computed(() => kiosksBehind(agentKiosks.value, availableVersion.value));
const blocked = computed(() => kiosksBlocked(agentKiosks.value, availableVersion.value));
const updatingKiosks = computed(() => agentKiosks.value.filter(k => k.agentUpdateRequested));

const behindCopy = computed(() =>
  behind.value.length === 1
    ? "1 kiosk can be updated to"
    : `${behind.value.length} of ${agentKiosks.value.length} kiosks can be updated to`
);
const updatingCopy = computed(() =>
  updatingKiosks.value.length === 1
    ? "Updating 1 kiosk… It restarts its screen when done."
    : `Updating ${updatingKiosks.value.length} kiosks… They restart their screen when done.`
);

// --- pages ---------------------------------------------------------------
const catalog = computed(() => normalizeDashboardScreens(props.config.dashboardScreens));
const pages = computed(() => catalog.value.screens);

// A screen shows Default's pages unless it has an explicit allowlist.
function availableIds(k) {
  return effectiveAvailablePages(k?.overrides, props.config, pages.value);
}
function startPageId(k) {
  const ids = availableIds(k);
  const def = k?.overrides?.defaultScreenId;
  if (def && ids.includes(def)) return def;
  if (catalog.value.activeScreenId && ids.includes(catalog.value.activeScreenId)) {
    return catalog.value.activeScreenId;
  }
  return ids[0] ?? null;
}
function startPage(k) {
  const id = startPageId(k);
  return pages.value.find(page => page.id === id) || pages.value[0] || null;
}

// --- per-screen facts used by the cards and the detail page --------------
function orientationFor(k) {
  return (k ? k.overrides?.orientation : null) ?? props.config.orientation ?? "landscape";
}
function flippedFor(k) {
  return (k ? k.overrides?.orientationFlipped : null) ?? props.config.orientationFlipped ?? false;
}
function scheduleFor(k) {
  return (k ? k.overrides?.displaySchedule : null) ?? props.config.displaySchedule;
}
function scheduleLabel(k) {
  if (effectiveScreenMode(k?.overrides, props.config) !== "schedule") return "";
  const days = Array.isArray(scheduleFor(k)) ? scheduleFor(k) : [];
  const day = days.find(entry => entry?.enabled && entry.offTime && entry.onTime);
  return day ? `off ${day.offTime}–${day.onTime}` : "";
}
// The summary names what the mode adds (UI spec §4.3): Schedule keeps its off
// hours, External says "External on/off", Always on adds nothing.
function modeSummary(k) {
  const mode = effectiveScreenMode(k?.overrides, props.config);
  if (mode === "external") return "External on/off";
  if (mode === "schedule") return scheduleLabel(k);
  return "";
}
function idleLabelFor(seconds) {
  if (!seconds) return "Never";
  if (seconds % 3600 === 0) {
    const hours = seconds / 3600;
    return `${hours} hour${hours === 1 ? "" : "s"}`;
  }
  if (seconds % 60 === 0) return `${seconds / 60} min`;
  return `${seconds} s`;
}
function oskLabel(value) {
  if (value === "on") return "Always";
  if (value === "off") return "Never";
  return "Auto";
}
function summaryFor(k) {
  const count = availableIds(k).length;
  const parts = [`${count} page${count === 1 ? "" : "s"}`, orientationFor(k)];
  if (flippedFor(k)) parts.push("upside down");
  const mode = modeSummary(k);
  if (mode) parts.push(mode);
  return parts.join(" · ");
}

// --- the Default card -----------------------------------------------------
const defaultSummary = computed(() => {
  const parts = [props.config.orientation || "landscape"];
  if (props.config.orientationFlipped) parts.push("upside down");
  const mode = modeSummary(null);
  if (mode) parts.push(mode);
  parts.push(`keyboard ${oskLabel(props.config.onScreenKeyboard)}`);
  const own = kiosks.value.filter(k => hasOwnSettings(k.overrides)).length;
  if (own === 1) parts.push("1 screen has its own settings");
  else if (own > 1) parts.push(`${own} screens have their own settings`);
  return parts.join(" · ");
});

// --- list / detail -------------------------------------------------------
const selectedKiosk = computed(() => kiosks.value.find(k => k.id === selectedId.value) || null);
const selectedChangedCount = computed(() => changedSettingCount(overrides.value));
const changedHereItems = computed(() => changedSettingRows(overrides.value));
const selectedName = computed(() => (selectedKiosk.value ? screenLabel(selectedKiosk.value) : ""));
const footerCopy = computed(() => {
  const count = selectedChangedCount.value;
  return `${count} ${count === 1 ? "setting differs" : "settings differ"} from the default.`;
});

// --- pairing (calvin-0xns) ------------------------------------------------
// The household choice saves through Settings' own config form, so the toggle
// shows the same saving state and rollback as every other config row.
const saveConfig = inject("saveConfig", null);
const pairingRequired = computed(() => props.config.kioskPairing === "required");
const recentKiosks = computed(() =>
  kiosks.value.filter(
    k => k.lastSeen && nowTick.value - Date.parse(k.lastSeen) <= 7 * 24 * 3600 * 1000
  )
);
const waitingPairings = computed(() => {
  const ids = new Set(kiosks.value.map(k => k.id));
  return store.pairings.filter(entry => !ids.has(entry.kioskId));
});

function isToday(isoText) {
  if (!isoText) return false;
  return new Date(isoText).toDateString() === new Date(nowTick.value).toDateString();
}

function pairedDateCopy(k) {
  if (!k?.pairedAt) return "Paired";
  return isToday(k.pairedAt) ? "Paired today" : `Paired since ${formatKeyDate(k.pairedAt)}`;
}

// §3.2: one meta line on each row. Paired wins; an old agent that cannot pair
// needs its Update first; every other unpaired row can pair.
function pairingLine(k) {
  if (!k) return null;
  if (k.paired) return { text: pairedDateCopy(k), tone: "neutral" };
  const required = pairingRequired.value;
  if (k.agentVersion != null && k.agentPairs !== true) {
    return {
      text: required
        ? "Needs a software update before it can be paired. Until then it can't report in or follow home automation."
        : "Needs a software update before it can be paired.",
      tone: required ? "warn" : "neutral",
    };
  }
  return {
    text: required
      ? "Not paired, so it can't report in or follow home automation. It shows a code to type in Pair a screen."
      : "Not paired. It shows a code to type in Pair a screen.",
    tone: required ? "warn" : "neutral",
  };
}

// §3.1: the count line counts registry rows seen this week, never waiting
// entries, and changes its warning with the household mode.
const countLine = computed(() => {
  const seen = recentKiosks.value;
  const n = seen.length;
  if (n === 0) return null;
  const p = seen.filter(k => k.paired).length;
  if (p === n) {
    return {
      tone: "neutral",
      text:
        n === 1
          ? "The screen seen this week is paired."
          : `All ${n} screens seen this week are paired.`,
    };
  }
  if (pairingRequired.value) {
    return {
      tone: "warn",
      text: `${p} of ${n} screens seen this week are paired. Only paired screens is on, so the others show the dashboard but can't report in or follow home automation.`,
    };
  }
  if (p === 0) {
    return {
      tone: "warn",
      text:
        n === 1
          ? "The screen seen this week isn't paired. Another device on your home network could pretend to be it."
          : `None of the ${n} screens seen this week are paired. Another device on your home network could pretend to be any of them.`,
    };
  }
  return {
    tone: "warn",
    text: `${p} of ${n} screens seen this week are paired. Another device on your home network could pretend to be an unpaired screen.`,
  };
});

// --- the Pairing section on the list --------------------------------------
const pairCode = ref("");
const pairField = ref(null);
const pairCodeInvalid = ref(false);
const pairingBusy = ref(false);
const pairCooldown = ref(false);
let pairCooldownTimer = null;
const pairResult = reactive({ text: "", tone: "ok", target: null });

function clearPairResult() {
  pairResult.text = "";
  pairResult.tone = "ok";
  pairResult.target = null;
}

function normalizePairCode(value) {
  return String(value ?? "")
    .replace(/[\s-]/g, "")
    .toUpperCase();
}

function onPairCodeInput(value) {
  pairCode.value = String(value ?? "").toUpperCase();
  // A keystroke clears the last answer, except the wait the server named.
  if (pairCooldown.value) return;
  pairCodeInvalid.value = false;
  if (pairResult.text) clearPairResult();
}

function focusPairField() {
  nextTick(() => pairField.value?.focus?.());
}

function retryAfterSeconds(err) {
  const headers = err?.response?.headers;
  const raw = headers?.["retry-after"] ?? headers?.get?.("retry-after");
  const seconds = Number(raw);
  return Number.isFinite(seconds) && seconds > 0 ? seconds : null;
}

function formatWait(seconds) {
  if (seconds == null) return "a minute";
  if (seconds <= 60) return `${Math.ceil(seconds)} seconds`;
  const minutes = Math.ceil(seconds / 60);
  return `${minutes} minute${minutes === 1 ? "" : "s"}`;
}

function startPairCooldown(seconds) {
  pairCooldown.value = true;
  pairResult.tone = "err";
  pairResult.text = `Too many wrong codes. Try again in ${formatWait(seconds)}.`;
  if (pairCooldownTimer !== null) clearTimeout(pairCooldownTimer);
  pairCooldownTimer = setTimeout(
    () => {
      pairCooldownTimer = null;
      pairCooldown.value = false;
      clearPairResult();
    },
    (seconds ?? 60) * 1000
  );
}

async function submitPair() {
  if (pairingBusy.value || pairCooldown.value) return;
  pairCodeInvalid.value = false;
  clearPairResult();
  const code = normalizePairCode(pairCode.value);
  if (!code) {
    pairCodeInvalid.value = true;
    pairResult.tone = "err";
    pairResult.text = "Type the code shown on the screen.";
    focusPairField();
    return;
  }
  if (code.length !== 6) {
    pairCodeInvalid.value = true;
    pairResult.tone = "err";
    pairResult.text = "A code has 6 letters and numbers, like K7Q-4MD.";
    focusPairField();
    return;
  }
  pairingBusy.value = true;
  try {
    const answer = await store.pairScreen(code);
    const name = answer?.displayName || answer?.id || "";
    pairResult.tone = "ok";
    pairResult.text = answer?.replaced
      ? `${name} is paired again. Its old pairing no longer works.`
      : `${name} is paired.`;
    pairResult.target = answer;
    pairCode.value = "";
    await Promise.all([store.loadKiosks(), store.loadPairings()]);
  } catch (err) {
    const status = err?.response?.status;
    if (status === 404) {
      pairCodeInvalid.value = true;
      pairResult.tone = "err";
      pairResult.text =
        "No screen is showing that code. Check the screen and type the code it shows now.";
    } else if (status === 429) {
      startPairCooldown(retryAfterSeconds(err));
    } else {
      pairResult.tone = "err";
      pairResult.text = friendlyError(err, "pair a screen");
    }
  } finally {
    pairingBusy.value = false;
    focusPairField();
  }
}

async function openPaired() {
  const id = pairResult.target?.id;
  if (id) await select(id);
}

// --- Only paired screens --------------------------------------------------
const pairingModeSaving = ref(false);
const pairingModeError = ref("");

function listNames(names) {
  if (names.length <= 1) return names[0] ?? "";
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  if (names.length === 3) return `${names[0]}, ${names[1]} and ${names[2]}`;
  return `${names.slice(0, 3).join(", ")} and ${names.length - 3} more`;
}

async function savePairingMode(mode) {
  pairingModeSaving.value = true;
  pairingModeError.value = "";
  try {
    if (typeof saveConfig === "function") await saveConfig({ kioskPairing: mode });
    else emit("update:config", { kioskPairing: mode });
  } catch (err) {
    pairingModeError.value = friendlyError(err, "change Only paired screens");
  } finally {
    pairingModeSaving.value = false;
  }
}

function onPairingModeToggle(next) {
  if (pairingModeSaving.value) return;
  if (!next) return savePairingMode("optional");
  const unpaired = recentKiosks.value.filter(k => !k.paired);
  if (unpaired.length === 0) return savePairingMode("required");
  const names = listNames(unpaired.map(screenLabel));
  confirm.mode = "pairing-mode";
  confirm.danger = false;
  confirm.title = "Turn on Only paired screens?";
  confirm.message =
    unpaired.length === 1
      ? `${names} isn't paired. It'll keep showing the dashboard, but stop reporting in and following home automation.`
      : `${names} aren't paired. They'll keep showing the dashboard, but stop reporting in and following home automation.`;
  confirm.confirmText = "Turn on";
  confirm.show = true;
}

// --- one screen's Pairing section -----------------------------------------
const pairingState = computed(() => {
  const k = selectedKiosk.value;
  if (!k) return { kind: "can-pair", paired: false };
  if (k.paired) return { kind: "paired", paired: true };
  if (k.agentVersion != null && k.agentPairs !== true) {
    return { kind: "needs-update", paired: false };
  }
  return { kind: "can-pair", paired: false };
});

const screenPairing = computed(() => {
  const k = selectedKiosk.value;
  if (!k) return { label: "", description: "" };
  if (pairingState.value.paired) {
    const since = k.pairedAt
      ? isToday(k.pairedAt)
        ? "Today."
        : `Since ${formatKeyDate(k.pairedAt)}.`
      : "";
    return {
      label: "Paired",
      description: `${since ? `${since} ` : ""}Only this screen can report in for itself.`,
    };
  }
  if (pairingState.value.kind === "needs-update") {
    return {
      label: "Not paired",
      description: "Needs a software update before it can be paired.",
    };
  }
  return {
    label: "Not paired",
    description: "This screen shows a code at the bottom. Type it in Pair a screen.",
  };
});

const unpairBusy = ref(false);
const unpairResult = noteRef();
const unpairButton = ref(null);
const pairScreenButton = ref(null);

function askUnpair() {
  const k = selectedKiosk.value;
  if (!k) return;
  const name = screenLabel(k);
  confirm.mode = "unpair";
  confirm.danger = true;
  confirm.title = `Unpair ${name}?`;
  confirm.message = `${name} will show a new code and stop reporting in until you pair it again.`;
  confirm.confirmText = "Unpair";
  confirm.show = true;
}

async function unpairSelected() {
  const id = selectedId.value;
  const name = selectedName.value;
  if (!id) return;
  unpairBusy.value = true;
  clear(unpairResult);
  try {
    const answer = await store.unpairScreen(id);
    // Re-read the list from the server: it also rewrites the localStorage
    // cache, so an offline reload cannot show the old paired state.
    await store.loadKiosks();
    say(
      unpairResult,
      answer?.changed === false
        ? `${name} wasn't paired.`
        : `${name} is unpaired. It shows a new code within a minute.`,
      "neutral"
    );
    await nextTick();
    pairScreenButton.value?.$el?.focus?.();
  } catch (err) {
    say(unpairResult, friendlyError(err, `unpair ${name}`), "err");
  } finally {
    unpairBusy.value = false;
  }
}

// The link on a screen's page lands on the one code field (§1.2). The two-pane
// layout already shows the list, so only a phone goes back to it.
async function goToPairField() {
  if (narrow.value) closeDetail();
  await nextTick();
  scrollSectionToTop(document.getElementById("screens-pairing"));
  focusPairField();
}

function clearMessages() {
  clear(remoteMsg);
  clear(nameMsg);
  clear(pagesMsg);
  clear(lookMsg);
  clearLookNote();
  clear(displayMsg);
  clear(effectsMsg);
  clear(controlsMsg);
  clear(powerMsg);
  clear(touchMsg);
  clear(behaviourMsg);
  clear(footerMsg);
  clear(removeMsg);
  clear(unpairResult);
  clearPairResult();
}

function openDefault({ fromRoute = false } = {}) {
  if (!fromRoute) syncScreenToRoute("default");
  selection.value = { kind: "default" };
  editorOpen.value = false;
  clearMessages();
}

function openBrowser({ fromRoute = false } = {}) {
  if (!fromRoute) syncScreenToRoute("browser");
  selection.value = { kind: "browser" };
  editorOpen.value = false;
  clearMessages();
  refreshBrowserCount();
}

async function select(id, { fromRoute = false } = {}) {
  if (!fromRoute) syncScreenToRoute(id);
  selection.value = { kind: "screen", id };
  clearMessages();
  const fetched = await store.fetchOverrides(id);
  // Guard the stale-selection race: clicking screen A then B before A's fetch
  // resolves must not land A's overrides under B's selection (calvin-vk3).
  if (selectedId.value !== id) return;
  kioskOverridesQueue(id).confirm(fetched);
  await refreshDesiredVersion(id);
  // The power row reads the server's answer: the command in force, who and
  // when it was set, and when it ends. A reselect always tries again.
  await refreshScreenPower(id, { force: true });
}

// The open screen vanished from the list (removed on another device): leave its
// page for the list and drop any confirm that was about it.
watch(selectedKiosk, kiosk => {
  if (kiosk || !selectedId.value) return;
  confirm.show = false;
  closeDetail();
});

function closeDetail({ fromRoute = false } = {}) {
  if (!fromRoute && phoneNavOn.value && route.query.screen) phoneNav.up();
  selection.value = null;
  editorOpen.value = false;
  clearMessages();
  refreshBrowserCount();
}

// --- effective values on the selected screen -----------------------------
const nameValue = computed(() => overrides.value.displayName || "");
const nameDraft = ref("");
watch(nameValue, value => (nameDraft.value = value), { immediate: true });
const namePlaceholder = computed(() =>
  selectedKiosk.value ? screenLabelFallback(selectedKiosk.value) : ""
);
function showsPage(pageId) {
  return effAvailable.value.includes(pageId);
}
// "Also on Hallway" / "Only here" for a page this screen shows. Browsers count
// as another target, but the Shown on row in the editor names each screen.
function alsoOnLabel(k, pageId) {
  const others = kiosks.value
    .filter(
      other =>
        other.id !== k?.id &&
        effectiveAvailablePages(other.overrides, props.config, pages.value).includes(pageId)
    )
    .map(other => screenLabel(other));
  if (others.length) return `Also on ${joinNames(others)}`;
  if (effectiveAvailablePages(null, props.config, pages.value).includes(pageId)) {
    return "Also on browsers";
  }
  return "Only here";
}

const availableOverridden = computed(() => "availableScreens" in overrides.value);
const effAvailable = computed(() =>
  effectiveAvailablePages(overrides.value, props.config, pages.value)
);

const defaultOverridden = computed(() => "defaultScreenId" in overrides.value);
const effDefault = computed(() => {
  const ids = effAvailable.value;
  const def = overrides.value.defaultScreenId;
  if (def && ids.includes(def)) return def;
  if (catalog.value.activeScreenId && ids.includes(catalog.value.activeScreenId)) {
    return catalog.value.activeScreenId;
  }
  return ids[0] ?? null;
});
const selectedStartPage = computed(
  () => pages.value.find(page => page.id === effDefault.value) || pages.value[0] || null
);

const orientationOverridden = computed(() => "orientation" in overrides.value);
const flipOverridden = computed(() => "orientationFlipped" in overrides.value);
const applyOverridden = computed(() => "applyDisplayRotation" in overrides.value);

const effOrientation = computed(() =>
  orientationOverridden.value
    ? overrides.value.orientation
    : (props.config.orientation ?? "landscape")
);
const effFlipped = computed(() =>
  flipOverridden.value ? overrides.value.orientationFlipped : props.config.orientationFlipped
);
const effApply = computed(() =>
  applyOverridden.value
    ? overrides.value.applyDisplayRotation
    : (props.config.applyDisplayRotation ?? true)
);
const previewCaption = computed(() => {
  const vp = selectedKiosk.value?.viewport;
  const size = vp && vp.w > 0 && vp.h > 0 ? `${vp.w}×${vp.h}` : "";
  return [selectedStartPage.value?.name || "", size].filter(Boolean).join(" · ");
});

// The screen power choice (calvin-25g9): one mode per screen, with the
// household choice as Default. The hint under the label explains the choice.
const scheduleOverridden = computed(() => "displaySchedule" in overrides.value);
const effSchedule = computed(() =>
  scheduleOverridden.value ? overrides.value.displaySchedule : props.config.displaySchedule
);
const screenPowerOverridden = computed(
  () => "screenPower" in overrides.value || "displayScheduleEnabled" in overrides.value
);
const effScreenPower = computed(() => effectiveScreenMode(overrides.value, props.config));
const screenPowerHint = computed(() => SCREEN_POWER_HINTS[effScreenPower.value] || "");
// A new tab on a wall panel is a dead end, so the guide note is not shown there.
const onKiosk = computed(
  () =>
    Boolean(kioskId) ||
    (typeof document !== "undefined" && document.documentElement.classList.contains("calvin-kiosk"))
);

// The server's power answer holds the command in force, who and when it was
// set, and (admin sessions only) the API key's name.
const screenPowerView = computed(() => selectedKiosk.value?.screenPowerView ?? null);
const powerTimeZone = computed(() => effectiveTimeZone(props.config));
const powerTimeFormat = computed(() => props.config.timeFormat || "24h");
const nowTick = ref(Date.now());
const now = () => new Date(nowTick.value);
useIntervalWhenVisible(() => {
  nowTick.value = Date.now();
}, 15000);
// A hidden presence row carries no command fields at all, so the page must not
// read their absence as "no command" (pairing spec §3.4).
const presenceHidden = computed(() => Boolean(selectedKiosk.value?.presenceHidden));
const unpairedPower = computed(
  () => selectedKiosk.value?.paired === false && props.config.kioskPairing === "required"
);
// A Schedule command ends at the boundary the server names in `until`; the
// tick hides it as soon as it passes, before the next read.
const commandNow = computed(() => {
  const view = screenPowerView.value;
  if (!view || (view.power !== "on" && view.power !== "off")) return null;
  // A command belongs to the mode it was given in; a mode changed here hides
  // the old one until the fresh read lands.
  if (view.mode && view.mode !== effScreenPower.value) return null;
  if (effScreenPower.value === "schedule" && view.until) {
    const until = Date.parse(view.until);
    if (Number.isFinite(until) && nowTick.value >= until) return null;
  }
  return view;
});
const powerBusy = ref(false);
const powerDirection = ref(null);
const powerOnButton = ref(null);
const powerOffButton = ref(null);

const desiredOnNow = computed(() => {
  if (effScreenPower.value === "always_on") return true;
  const view = screenPowerView.value;
  const answeredOn = view && typeof view.desiredOn === "boolean" ? view.desiredOn : null;
  // An unpaired screen receives no command: the answer's desiredOn is the only
  // truth, never the stored command (server design §6).
  if (unpairedPower.value && answeredOn !== null) return answeredOn;
  if (commandNow.value) return commandNow.value.power === "on";
  // With no command in force, the answer already accounts for the screen's
  // zone and gating. A command that expired locally is the exception: the
  // schedule takes over in the browser until the next read.
  const hadCommand = view && (view.power === "on" || view.power === "off");
  if (answeredOn !== null && !hadCommand) return answeredOn;
  // External with no command yet is on.
  if (effScreenPower.value === "external") return true;
  return scheduleDesiredOn({
    enabled: true,
    schedule: effSchedule.value,
    now: now(),
    timeZone: powerTimeZone.value,
  });
});
const powerStateCopy = computed(() => {
  if (presenceHidden.value) return "";
  const state = desiredOnNow.value ? "On" : "Off";
  // Home automation's command is not reaching an unpaired screen, so its name
  // and time would mislead: keep the state and drop them.
  if (unpairedPower.value) return state;
  const view = commandNow.value;
  if (!view) {
    if (effScreenPower.value === "external") return "On · no command yet";
    return `${state} · by the schedule`;
  }
  const when = formatWhen(view.setAt, {
    timeFormat: powerTimeFormat.value,
    timezone: powerTimeZone.value,
    now: now(),
  });
  const who = view.by === "settings" ? "set here" : `set by ${keyNameLabel(view.keyName)}`;
  return `${state} · ${who}${when ? ` ${when}` : ""}`;
});
const untilCopy = computed(() => {
  if (effScreenPower.value !== "schedule") return "";
  // An unpaired screen receives no command, so the stored until says nothing
  // about when this screen will change.
  if (unpairedPower.value) return "";
  const view = commandNow.value;
  if (view) {
    if (!view.until) return "";
    return `Until the next scheduled change at ${formatUntil(
      view.until,
      powerTimeZone.value,
      powerTimeFormat.value
    )}`;
  }
  const boundary = nextScheduleBoundary({
    enabled: true,
    schedule: effSchedule.value,
    now: now(),
    timeZone: powerTimeZone.value,
  });
  if (!boundary) return "";
  const at = formatUntil(boundary, powerTimeZone.value, powerTimeFormat.value);
  return desiredOnNow.value ? `Turns off at ${at}` : `Turns on at ${at}`;
});
const unpairedPowerNote = computed(() => {
  if (!unpairedPower.value) return "";
  return effScreenPower.value === "external"
    ? "Not paired, so home automation can't switch it. Pair it to use External."
    : "Not paired, so home automation can't switch it. Its schedule still works.";
});
const offlineCopy = computed(() => {
  if (!selectedKiosk.value || isOnline(selectedKiosk.value)) return "";
  // A hidden row has no answer to say which way it will go; never guess.
  if (presenceHidden.value) return "Offline.";
  return desiredOnNow.value
    ? "Offline. It turns on when it's back."
    : "Offline. It turns off when it's back.";
});
const powerOnLabel = computed(() =>
  effScreenPower.value === "external" ? "Turn on" : "Turn on now"
);
const powerOffLabel = computed(() =>
  effScreenPower.value === "external" ? "Turn off" : "Turn off now"
);
const showBackToSchedule = computed(
  () => effScreenPower.value === "schedule" && (presenceHidden.value || Boolean(commandNow.value))
);

function serverMessage(err) {
  const detail = err?.response?.data?.detail;
  if (detail && typeof detail === "object" && typeof detail.message === "string") {
    return detail.message;
  }
  return "";
}

// The two 409s (UI spec §3.4): the server's own sentence, then a fresh read,
// because the mode changed on another device. 429 names the wait.
function showPowerFailure(err, action) {
  const status = err?.response?.status;
  if (status === 409) {
    const message = serverMessage(err);
    if (message) {
      say(powerMsg, message, "err");
      refreshScreenPower(selectedId.value, { force: true });
      return;
    }
  }
  if (status === 429) {
    say(
      powerMsg,
      `Too many changes in a minute. Try again in ${formatWait(retryAfterSeconds(err))}.`,
      "err"
    );
    return;
  }
  say(powerMsg, friendlyError(err, action), "err");
}

// The last 401/403 for this screen, and the read in flight. A signed-out
// viewer of a gated screen must not make the interval ask again every 30 s:
// each answer reopens the sign-in dialog after the person dismissed it. A
// reselect or a new sign-in tries once more.
let powerReadDeniedId = null;
let powerReadInFlight = false;
let powerReadQueuedFor = null;

async function refreshScreenPower(id = selectedId.value, { force = false } = {}) {
  if (!id) return;
  if (powerReadInFlight) {
    // A tick is skipped, but a reselect or sign-in must not be swallowed:
    // remember it and run once the current read lands.
    if (force) powerReadQueuedFor = id;
    return;
  }
  if (!force && (powerReadDeniedId === id || !auth.authenticated)) return;
  powerReadInFlight = true;
  try {
    await store.fetchScreenPower(id);
    if (powerReadDeniedId === id) powerReadDeniedId = null;
  } catch (err) {
    const status = err?.response?.status;
    // The admin-only view (and its key name) is no longer ours to show; drop
    // it rather than keep the last copy. Offline keeps the last copy.
    if (status === 401 || status === 403) {
      powerReadDeniedId = id;
      store.clearScreenPower(id);
    }
  } finally {
    powerReadInFlight = false;
    const queuedId = powerReadQueuedFor;
    powerReadQueuedFor = null;
    if (queuedId && queuedId === selectedId.value) {
      void refreshScreenPower(queuedId, { force: true });
    }
  }
}

// A new admin session makes the withheld answer readable again.
watch(
  () => auth.authenticated,
  authenticated => {
    if (!authenticated) return;
    powerReadDeniedId = null;
    refreshScreenPower(selectedId.value, { force: true });
  }
);

async function setScreenNow(power) {
  // aria-disabled keeps the button in the keyboard order, so the tap still
  // arrives: do nothing while a call runs, or when it is already so. A hidden
  // presence row cannot know what is already so.
  if (powerBusy.value || (!presenceHidden.value && (power === "on") === desiredOnNow.value)) return;
  const id = selectedId.value;
  if (!id) return;
  powerBusy.value = true;
  powerDirection.value = power;
  clear(powerMsg);
  try {
    // One press is one call: the server owns what a command means in the mode.
    await store.setScreenPower(id, power);
    const online = selectedKiosk.value ? isOnline(selectedKiosk.value) : false;
    say(powerMsg, online ? APPLIED_BY_AGENT : OFFLINE_COPY);
  } catch (err) {
    showPowerFailure(err, `turn ${selectedName.value} ${power}`);
  } finally {
    powerBusy.value = false;
    powerDirection.value = null;
    // Button's loading state disables it, which blurs it; put focus back on the
    // choice that was pressed so the person keeps their place (UI spec §3.4).
    await nextTick();
    const target = power === "on" ? powerOnButton.value : powerOffButton.value;
    target?.$el?.focus?.();
  }
}

async function followSchedule() {
  const id = selectedId.value;
  if (!id || powerBusy.value) return;
  powerBusy.value = true;
  clear(powerMsg);
  let cleared = false;
  try {
    await store.setScreenPower(id, "schedule");
    cleared = true;
    const online = selectedKiosk.value ? isOnline(selectedKiosk.value) : false;
    say(powerMsg, online ? APPLIED_BY_AGENT : OFFLINE_COPY);
  } catch (err) {
    showPowerFailure(err, "change this screen");
  } finally {
    powerBusy.value = false;
    if (cleared) {
      // Back to schedule leaves the DOM with the command; put focus on the
      // Screen now choice that is still available (UI spec §3.4).
      await nextTick();
      const target = desiredOnNow.value ? powerOffButton.value : powerOnButton.value;
      target?.$el?.focus?.();
    }
  }
}

// "Dimming… then off" (calvin-29ws): with the ramp on, "Turn off" first steps
// the brightness down. The agent picks the change up within its 60 s poll.
const AGENT_POLL_S = 60;
const dimmingSeconds = computed(() => {
  const command = commandNow.value;
  const values = overrides.value;
  if (!command || command.power !== "off" || !command.setAt) return null;
  if (values.brightnessRampEnabled !== true && values.sleepMode !== "dim") return null;
  const level = values.brightness ?? firstBrightness(values.brightnessLimit ?? null);
  const seconds = dimSeconds(
    level,
    values.brightnessStep ?? 2,
    values.brightnessStepSeconds ?? 1.5
  );
  const elapsed = (nowTick.value - Date.parse(command.setAt)) / 1000;
  return elapsed < seconds + AGENT_POLL_S ? seconds : null;
});

// The Brightness group and the display check write typed per-screen overrides.
// A key set to null is cleared.
function patchBrightness(change) {
  const next = { ...overrides.value };
  for (const [key, value] of Object.entries(change)) {
    if (value === null || value === undefined) delete next[key];
    else next[key] = value;
  }
  // A brightness above the limit is never stored.
  return persistPower(clampBrightness(next));
}

const checkOpen = ref(false);
// The first check turns the ramp on with Save itself: Save writes the levels and the
// ramp in one patch (the dialog's wake option), so the page makes no second write.
function openCheck() {
  checkOpen.value = true;
}
const idleOverridden = computed(
  () => "displayTimeoutEnabled" in overrides.value || "displayTimeout" in overrides.value
);
const idleValue = computed(() => {
  const enabled =
    "displayTimeoutEnabled" in overrides.value
      ? overrides.value.displayTimeoutEnabled
      : props.config.displayTimeoutEnabled;
  if (!enabled) return 0;
  const seconds =
    "displayTimeout" in overrides.value
      ? overrides.value.displayTimeout
      : props.config.displayTimeout;
  return Number(seconds) || 0;
});
const IDLE_OPTIONS = [
  { value: 0, label: "Never" },
  { value: 300, label: "5 min" },
  { value: 900, label: "15 min" },
  { value: 1800, label: "30 min" },
  { value: 3600, label: "1 hour" },
  { value: 7200, label: "2 hours" },
];
const idleOptions = computed(() => {
  const current = idleValue.value;
  if (IDLE_OPTIONS.some(option => option.value === current)) return IDLE_OPTIONS;
  return [...IDLE_OPTIONS, { value: current, label: idleLabelFor(current) }].sort(
    (a, b) => a.value - b.value
  );
});

const touchOverridden = computed(() => "touchControls" in overrides.value);
const effTouch = computed(() =>
  touchOverridden.value ? overrides.value.touchControls : (props.config.touchControls ?? "auto")
);

const oskOverridden = computed(() => "onScreenKeyboard" in overrides.value);
const effOsk = computed(() =>
  oskOverridden.value ? overrides.value.onScreenKeyboard : (props.config.onScreenKeyboard ?? "auto")
);

// --- writes --------------------------------------------------------------
// Every control on a screen writes the same overrides target. The shared queue
// shows the change at once, coalesces quick taps, and on failure reverts only
// the keys whose value has not been tapped again since.
async function persist(next, messageRef, onlineCopy, offlineCopy) {
  const kioskId = selectedId.value;
  if (!kioskId) return false;
  if (messageRef) clear(messageRef);
  try {
    await kioskOverridesQueue(kioskId).replaceAll(next);
    const online = selectedKiosk.value ? isOnline(selectedKiosk.value) : false;
    if (messageRef) say(messageRef, online ? onlineCopy : offlineCopy);
    await refreshDesiredVersion(kioskId);
    return true;
  } catch (err) {
    if (messageRef) say(messageRef, friendlyError(err, "change this screen"), "err");
    return false;
  }
}

const OFFLINE_COPY = "Saved. Changes apply when this screen reconnects.";

// Where a change is applied decides the wait we promise. The kiosk display
// agent polls its merged config every 60 s (DEFAULT_REFRESH_SECONDS in
// deploy/kiosk-agent); the dashboard page polls every 30 s (configPollInterval)
// and applies its own rows itself. Keep one phrase per path.
const APPLIED_BY_AGENT = "Saved. This screen updates within a minute.";
const APPLIED_BY_PAGE = "Saved. This screen updates within 30 seconds.";

function setName(value) {
  const trimmed = value.trim();
  const next = { ...overrides.value };
  if (trimmed) next.displayName = trimmed;
  else delete next.displayName;
  persist(next, nameMsg, APPLIED_BY_PAGE, OFFLINE_COPY);
}

function persistPages(next) {
  persist(next, pagesMsg, APPLIED_BY_PAGE, OFFLINE_COPY);
}

function togglePage(pageId, checked) {
  const ids = new Set(effAvailable.value);
  if (checked) ids.add(pageId);
  else ids.delete(pageId);
  if (ids.size === 0) {
    say(pagesMsg, "Pick at least one page.", "err");
    return;
  }
  const next = { ...overrides.value };
  const allIds = pages.value.map(page => page.id);
  const defaultIds = effectiveAvailablePages(null, props.config, pages.value);
  const followsDefault = ids.size === defaultIds.length && defaultIds.every(id => ids.has(id));
  if (followsDefault) delete next.availableScreens;
  else next.availableScreens = allIds.filter(id => ids.has(id));
  const effective = followsDefault ? defaultIds : next.availableScreens;
  if ("defaultScreenId" in next && !effective.includes(next.defaultScreenId)) {
    delete next.defaultScreenId;
  }
  persistPages(next);
}

function setDefault(pageId) {
  persistPages({ ...overrides.value, defaultScreenId: pageId });
}
function resetAvailable() {
  const next = { ...overrides.value };
  delete next.availableScreens;
  if ("defaultScreenId" in next && !pages.value.some(page => page.id === next.defaultScreenId)) {
    delete next.defaultScreenId;
  }
  persistPages(next);
}
function resetDefaultScreen() {
  const next = { ...overrides.value };
  delete next.defaultScreenId;
  persistPages(next);
}

// --- Look: theme, light or dark and font (§7 item 6) ----------------------
// These rows write this screen's overrides from any browser, so editing the
// kitchen's theme from a desktop never changes the desktop's own look. The
// kiosk applies the merged config on its next poll (~30 s).
const lookDescriptors = descriptorsForSection("look");
const lookOverridden = computed(() =>
  Object.fromEntries(
    lookDescriptors.map(descriptor => [descriptor.key, descriptor.key in overrides.value])
  )
);
const look = computed(() =>
  Object.fromEntries(
    lookDescriptors.map(descriptor => [
      descriptor.key,
      descriptor.key in overrides.value
        ? overrides.value[descriptor.key]
        : (props.config[descriptor.key] ?? descriptor.defaultValue),
    ])
  )
);
const visibleLookDescriptors = computed(() => visibleDescriptors(lookDescriptors, look.value));

const LOOK_NOTE_MS = 10000;
let lookNoteTimer = null;
function clearLookNote() {
  if (lookNoteTimer !== null) {
    clearTimeout(lookNoteTimer);
    lookNoteTimer = null;
  }
  lookNote.value = { key: "", text: "" };
}
function showLookNote(key) {
  clearLookNote();
  lookNote.value = {
    key,
    text: `${selectedName.value} will switch on its next check (about 30 s)`,
  };
  lookNoteTimer = setTimeout(clearLookNote, LOOK_NOTE_MS);
}
function persistLook(next, key) {
  return persist(next, lookMsg, APPLIED_BY_AGENT, OFFLINE_COPY).then(ok => {
    if (ok) showLookNote(key);
    return ok;
  });
}
function setLook(key, value) {
  persistLook({ ...overrides.value, [key]: value }, key);
}
function resetLook(key) {
  const next = { ...overrides.value };
  delete next[key];
  persistLook(next, key);
}

// --- Display rows moved in from Dashboard (§7 item 6) ---------------------
const DISPLAY_ROW_KEYS = ["touchControlSize", "keepScreensReady", "uiSize"];
const displayRows = descriptorsForSection("display").filter(descriptor =>
  DISPLAY_ROW_KEYS.includes(descriptor.key)
);
const displayRowValuesOverridden = computed(() =>
  Object.fromEntries(
    displayRows.map(descriptor => [descriptor.key, descriptor.key in overrides.value])
  )
);
const displayRowValues = computed(() =>
  Object.fromEntries(
    displayRows.map(descriptor => [
      descriptor.key,
      descriptor.key in overrides.value
        ? overrides.value[descriptor.key]
        : (props.config[descriptor.key] ?? descriptor.defaultValue),
    ])
  )
);
function persistDisplayRow(next) {
  persist(next, displayMsg, APPLIED_BY_AGENT, OFFLINE_COPY);
}
function setDisplayRow(key, value) {
  persistDisplayRow({ ...overrides.value, [key]: value });
}
function resetDisplayRow(key) {
  const next = { ...overrides.value };
  delete next[key];
  persistDisplayRow(next);
}

function persistDisplay(next) {
  persist(next, displayMsg, APPLIED_BY_AGENT, OFFLINE_COPY);
}
function setOrientation(value) {
  persistDisplay({ ...overrides.value, orientation: value });
}
function setFlipped(value) {
  persistDisplay({ ...overrides.value, orientationFlipped: value });
}
function setApply(value) {
  persistDisplay({ ...overrides.value, applyDisplayRotation: value });
}
function resetOrientationRow() {
  const next = { ...overrides.value };
  delete next.orientation;
  persistDisplay(next);
}
function resetFlip() {
  const next = { ...overrides.value };
  delete next.orientationFlipped;
  persistDisplay(next);
}
function resetApply() {
  const next = { ...overrides.value };
  delete next.applyDisplayRotation;
  persistDisplay(next);
}

function persistPower(next) {
  return persist(next, powerMsg, APPLIED_BY_AGENT, OFFLINE_COPY);
}
async function setScreenPowerMode(mode) {
  if (mode === effScreenPower.value) return;
  // The schedule itself is never touched. The legacy switch travels with the
  // mode so an older backend, or a restore onto one, still reads it right.
  const next = {
    ...overrides.value,
    screenPower: mode,
    displayScheduleEnabled: mode === "schedule",
  };
  const saved = await persistPower(next);
  // Changing the mode ends the command on the server (design decision 5).
  if (saved) await refreshScreenPower(selectedId.value, { force: true });
}
async function resetScreenPower() {
  const next = { ...overrides.value };
  delete next.screenPower;
  delete next.displayScheduleEnabled;
  const saved = await persistPower(next);
  if (saved) await refreshScreenPower(selectedId.value, { force: true });
}
// External's key notes (UI spec §5). The keys page is a Settings destination;
// the guide opens in a new tab, except on the kiosk itself.
function openApiKeys() {
  router.push({ path: "/settings", query: { setting: "security-api-keys" } });
}
function openGuide() {
  window.open(HOME_AUTOMATION_GUIDE_URL, "_blank", "noopener");
}
function setSchedule(value) {
  persistPower({ ...overrides.value, displaySchedule: value });
}
function resetDailySchedule() {
  const next = { ...overrides.value };
  delete next.displaySchedule;
  persistPower(next);
}
function setIdle(seconds) {
  const next = { ...overrides.value };
  if (!seconds) {
    next.displayTimeoutEnabled = false;
    delete next.displayTimeout;
  } else {
    next.displayTimeoutEnabled = true;
    next.displayTimeout = seconds;
  }
  persistPower(next);
}
function resetIdle() {
  const next = { ...overrides.value };
  delete next.displayTimeoutEnabled;
  delete next.displayTimeout;
  persistPower(next);
}

function persistTouch(next) {
  persist(next, touchMsg, APPLIED_BY_PAGE, OFFLINE_COPY);
}
function setTouch(value) {
  persistTouch({ ...overrides.value, touchControls: value });
}
function resetTouch() {
  const next = { ...overrides.value };
  delete next.touchControls;
  persistTouch(next);
}
function setOsk(value) {
  persistTouch({ ...overrides.value, onScreenKeyboard: value });
}
function resetOsk() {
  const next = { ...overrides.value };
  delete next.onScreenKeyboard;
  persistTouch(next);
}

// --- Effects & focus: the whole group moved here (§7 item 4) ----------------
// Effects decides how expensive the look is; Focus light and Dim other regions
// decide whether it shows at all (calvin-uudb). The rows read this screen's
// overrides over the household values, like Behaviour.
const effectsDescriptors = descriptorsForSection("effects");
const effectsOverridden = computed(() =>
  Object.fromEntries(
    effectsDescriptors.map(descriptor => [descriptor.key, descriptor.key in overrides.value])
  )
);
const effects = computed(() =>
  Object.fromEntries(
    effectsDescriptors.map(descriptor => [
      descriptor.key,
      descriptor.key in overrides.value
        ? overrides.value[descriptor.key]
        : (props.config[descriptor.key] ?? descriptor.defaultValue),
    ])
  )
);
const visibleEffectsDescriptors = computed(() =>
  visibleDescriptors(effectsDescriptors, effects.value)
);
const effectsAutoCopy = `Auto (${effectsLevelLabel(
  resolveEffectsLevel({ level: "auto", kiosk: true })
)} on this screen)`;

function persistEffects(next) {
  persist(next, effectsMsg, APPLIED_BY_PAGE, OFFLINE_COPY);
}
function setEffects(key, value) {
  persistEffects({ ...overrides.value, [key]: value });
}
function resetEffects(key) {
  const next = { ...overrides.value };
  delete next[key];
  persistEffects(next);
}

// --- Controls: the whole group moved here (§7 item 4) ----------------------
// On a kiosk these used to edit only the device you were on (the bug behind
// H1/G1); a screen page now writes that screen's overrides from any browser.
const controlDescriptors = descriptorsForSection("controls");
const controlsOverridden = computed(() =>
  Object.fromEntries(
    controlDescriptors.map(descriptor => [descriptor.key, descriptor.key in overrides.value])
  )
);
const controls = computed(() =>
  Object.fromEntries(
    controlDescriptors.map(descriptor => [
      descriptor.key,
      descriptor.key in overrides.value
        ? overrides.value[descriptor.key]
        : (props.config[descriptor.key] ?? descriptor.defaultValue),
    ])
  )
);
const visibleControlDescriptors = computed(() =>
  visibleDescriptors(controlDescriptors, controls.value)
);

function persistControls(next) {
  persist(next, controlsMsg, APPLIED_BY_PAGE, OFFLINE_COPY);
}
function setControl(key, value) {
  persistControls({ ...overrides.value, [key]: value });
}
function resetControl(key) {
  const next = { ...overrides.value };
  delete next[key];
  persistControls(next);
}

// --- Remote & keys: the button-press label --------------------------------
// Per screen, like Controls. The shared rows (Hide label after, bindings,
// reboot keys) are on Default only; this page points there.
const remoteDescriptors = descriptorsForSection("remote");
const remoteOverridden = computed(() =>
  Object.fromEntries(
    remoteDescriptors.map(descriptor => [descriptor.key, descriptor.key in overrides.value])
  )
);
const remote = computed(() =>
  Object.fromEntries(
    remoteDescriptors.map(descriptor => [
      descriptor.key,
      descriptor.key in overrides.value
        ? overrides.value[descriptor.key]
        : (props.config[descriptor.key] ?? descriptor.defaultValue),
    ])
  )
);
const visibleRemoteDescriptors = computed(() =>
  visibleDescriptors(remoteDescriptors, remote.value)
);
function persistRemote(next) {
  persist(next, remoteMsg, APPLIED_BY_PAGE, OFFLINE_COPY);
}
function setRemote(key, value) {
  persistRemote({ ...overrides.value, [key]: value });
}
function resetRemote(key) {
  const next = { ...overrides.value };
  delete next[key];
  persistRemote(next);
}
async function openDefaultRemote() {
  if (phoneNavOn.value) {
    await phoneNav.open({ screen: "default", section: "device-remote" });
    return;
  }
  openDefault();
  await nextTick();
  scrollSectionToTop(document.getElementById("section-device-remote"));
}

// A deep link brings its section into view. The shared helper hands someone
// who asked for less motion the jump, not the scroll.
function scrollSectionToTop(section) {
  if (!section || typeof section.scrollIntoView !== "function") return;
  section.scrollIntoView({ behavior: scrollBehavior(), block: "start" });
}

// --- Behaviour: photo frame, loading light and layout (§4) -----------------
// These rows moved here from Dashboard › Focus & remote; the keys stay the
// same, so a screen's existing override (or this browser's stored choice) is
// untouched. The row itself is descriptor-driven; this page hands it the
// screen's overrides and the household value underneath.
const behaviourDescriptors = descriptorsForSection("behaviour");

const behaviourOverridden = computed(() =>
  Object.fromEntries(
    behaviourDescriptors.map(descriptor => [descriptor.key, descriptor.key in overrides.value])
  )
);

const defaultBehaviourValue = key => {
  if (key === "layoutMode") return props.config.layoutMode ?? "auto";
  return props.config[key];
};

const behaviour = computed(() =>
  Object.fromEntries(
    behaviourDescriptors.map(descriptor => [
      descriptor.key,
      descriptor.key in overrides.value
        ? overrides.value[descriptor.key]
        : defaultBehaviourValue(descriptor.key),
    ])
  )
);

const visibleBehaviourDescriptors = computed(() =>
  visibleDescriptors(behaviourDescriptors, behaviour.value)
);

function persistBehaviour(next) {
  persist(
    next,
    behaviourMsg,
    "Saved. This screen picks up the change at its next check-in (~30s).",
    OFFLINE_COPY
  );
}
function setBehaviour(key, value) {
  persistBehaviour({ ...overrides.value, [key]: value });
}
function resetBehaviour(key) {
  const next = { ...overrides.value };
  delete next[key];
  persistBehaviour(next);
}

// --- footer: reset everything · use these as the default (§4) ------------
const confirm = reactive({
  show: false,
  mode: null,
  title: "",
  message: "",
  confirmText: "",
  danger: true,
});

function askResetEverything() {
  const count = selectedChangedCount.value;
  confirm.mode = "reset";
  confirm.danger = true;
  confirm.title = `Reset ${selectedName.value} to the default?`;
  confirm.message = `Its ${count} changed ${count === 1 ? "setting goes" : "settings go"} back to the default. Its name stays.`;
  confirm.confirmText = "Reset";
  confirm.show = true;
}

function askUseAsDefault() {
  const patch = useAsDefaultPatch(overrides.value);
  const list = formatSettingList(Object.keys(patch));
  if (!list) return;
  confirm.mode = "use-default";
  confirm.danger = false;
  confirm.title = `Make ${selectedName.value}'s settings the default?`;
  confirm.message = `Default and every screen that follows it will use ${selectedName.value}'s ${list}.`;
  confirm.confirmText = "Make default";
  confirm.show = true;
}

const removeMsg = noteRef();
const removeBlockedReason = computed(() =>
  selectedKiosk.value?.displayCheckActive
    ? "A display check is running on this screen. Stop it first."
    : ""
);

function askRemove() {
  confirm.mode = "remove";
  confirm.danger = true;
  confirm.title = `Remove ${selectedName.value}?`;
  confirm.message =
    "Its own settings and calibration are deleted. If this screen is still running, it will show up again the next time it checks in.";
  confirm.confirmText = "Remove";
  confirm.show = true;
}

async function removeSelected() {
  const id = selectedId.value;
  if (!id) return;
  const name = selectedName.value;
  try {
    await store.removeKiosk(id);
  } catch (err) {
    say(
      removeMsg,
      err?.response?.status === 409
        ? "Couldn't remove it: a display check is running on this screen."
        : `Couldn't remove ${name}. Try again.`,
      "err"
    );
    return;
  }
  // Land on the list, which has the next screen to pick.
  closeDetail();
  notifications.notify({ severity: "success", eyebrow: "Screens", message: `Removed ${name}.` });
}

async function onConfirm() {
  const mode = confirm.mode;
  confirm.show = false;
  if (mode === "remove") return removeSelected();
  if (mode === "unpair") return unpairSelected();
  if (mode === "pairing-mode") return savePairingMode("required");
  if (mode === "reset") {
    await persist(
      withoutAllOverrides(overrides.value),
      footerMsg,
      "Saved. This screen follows the default again.",
      OFFLINE_COPY
    );
  } else if (mode === "use-default") {
    const patch = useAsDefaultPatch(overrides.value);
    if (Object.keys(patch).length === 0) return;
    emit("update:config", patch);
    await persist(
      withoutPromotedSettings(overrides.value),
      footerMsg,
      "Saved. New screens and screens that follow the default use these settings.",
      OFFLINE_COPY
    );
  }
}

// --- software ------------------------------------------------------------
function showUpdateButton(k) {
  return isVersionBehind(k, availableVersion.value) && !isUpdateBlocked(k);
}
function softwareTone(k) {
  if (isUpdateBlocked(k)) return "warn";
  if (hasUpdateError(k)) return "err";
  return "neutral";
}
function softwareLine(k) {
  if (k?.agentVersion == null) return "";
  // What the kiosk actually runs, beside the agent version (calvin-2ibz).
  const lead = `${displayStackLabel(k)} · `;
  const tone = softwareTone(k);
  if (k.agentUpdateRequested) return `${lead}Updating to ${shortVersion(availableVersion.value)}…`;
  if (tone === "warn") {
    return `${lead}Kiosk software ${shortVersion(k.agentVersion)} · update needs a newer OS`;
  }
  if (tone === "err") {
    return `${lead}Kiosk software ${shortVersion(k.agentVersion)} · last update failed, kept this version`;
  }
  if (availableVersion.value == null) {
    return `${lead}Kiosk software ${shortVersion(k.agentVersion)}`;
  }
  if (!isVersionBehind(k, availableVersion.value)) {
    return `${lead}Kiosk software ${shortVersion(k.agentVersion)} · up to date`;
  }
  return `${lead}Kiosk software ${shortVersion(k.agentVersion)} · ${shortVersion(availableVersion.value)} available`;
}
async function checkManifest() {
  manifestChecking.value = true;
  try {
    availableVersion.value = await store.fetchAvailableAgentVersion();
  } finally {
    manifestChecking.value = false;
  }
}
async function onUpdate(id) {
  await store.triggerUpdate(id);
}
async function updateAll() {
  // Offline kiosks get the request too: the flag waits for their next poll.
  const targets = behind.value;
  const results = await Promise.allSettled(targets.map(k => store.triggerUpdate(k.id)));
  results.forEach((result, index) => {
    if (result.status === "rejected") {
      notifications.notify({
        severity: "error",
        eyebrow: "Screens",
        // The name on the card, never the internal id (CLV-63).
        message: `Couldn't start the update on ${screenLabel(targets[index])}.`,
      });
    }
  });
  await store.loadKiosks();
}

// --- presence + versions ------------------------------------------------
const ONLINE_WINDOW_MS = 120000; // 2 minutes

useIntervalWhenVisible(async () => {
  const refreshed = await store.refreshKiosks();
  store.loadPairings();
  // The list carries no command; re-read the open screen's power answer so a
  // command from home automation (or its end) shows within one interval.
  await refreshScreenPower();
  // A failed first load left a ?screen= link unresolved. When the backend
  // comes back, this fresh list can open the screen or finally say it is gone.
  if (refreshed?.ok && !refreshed.stale) {
    kiosksFresh.value = true;
    if (phoneNavOn.value && route.query.screen) applyRouteScreen(route.query.screen);
  }
}, 30000);

function isPending(k) {
  const desired = desiredVersions.value[k.id];
  return !isOnline(k) && !!desired && k.lastAppliedVersion !== desired;
}
function isOnline(k) {
  if (!k.lastSeen) return false;
  return nowTick.value - Date.parse(k.lastSeen) < ONLINE_WINDOW_MS;
}
function relativeTime(iso) {
  if (!iso) return "never";
  const secs = Math.max(0, Math.round((nowTick.value - Date.parse(iso)) / 1000));
  if (secs < 60) return `${secs}s ago`;
  if (secs < 3600) return `${Math.round(secs / 60)}m ago`;
  if (secs < 86400) return `${Math.round(secs / 3600)}h ago`;
  return `${Math.round(secs / 86400)}d ago`;
}
async function refreshDesiredVersion(id) {
  const v = await store.fetchDeviceConfigVersion(id);
  if (v) desiredVersions.value = { ...desiredVersions.value, [id]: v };
}

// Never lose a queued override save on navigation or a page close.
const flushQueuedOverrides = () => {
  void flushKioskOverridesQueues();
};
// On a page close the request must outlive the page (fetch keepalive).
const flushQueuedOverridesOnPageClose = () => {
  void flushKioskOverridesQueues({ keepalive: true });
};
if (typeof window !== "undefined") {
  window.addEventListener("beforeunload", flushQueuedOverridesOnPageClose);
  window.addEventListener("pagehide", flushQueuedOverridesOnPageClose);
}

onMounted(async () => {
  refreshBrowserCount();
  await syncInitialPhoneRoute();
  const kiosksLoad = await store.loadKiosks();
  // Only a list that arrived can open a linked screen; only a fresh one can
  // say it is gone. An unreachable backend with no cache leaves the link alone.
  kiosksFresh.value = Boolean(kiosksLoad?.ok) && !kiosksLoad?.stale;
  if (kiosksLoad?.ok && phoneNavOn.value && route.query.screen)
    applyRouteScreen(route.query.screen);
  // Pairings are a hint; they must not delay the linked page above.
  await store.loadPairings();
  if (initialOwnScreenId) {
    await select(initialOwnScreenId);
    // The remote's anchor has a different id on a screen's own page; Settings.vue
    // could only scroll to Default's, so open the screen's section here.
    if (initialSectionId !== props.initialSection) {
      await nextTick();
      scrollSectionToTop(document.getElementById(`section-${initialSectionId}`));
    }
  }
  if (kiosks.value.length === 0) addOpen.value = true;
  // Fetch all versions concurrently, then commit ONCE — writing the map inside
  // each concurrent callback races (each spreads a stale base, last write wins,
  // dropping entries).
  const [entries] = await Promise.all([
    Promise.all(kiosks.value.map(async k => [k.id, await store.fetchDeviceConfigVersion(k.id)])),
    checkManifest(),
  ]);
  const next = { ...desiredVersions.value };
  for (const [id, v] of entries) if (v) next[id] = v;
  desiredVersions.value = next;
});

onUnmounted(() => {
  phoneNav?.setTitle("screen", "");
  phoneNav?.setTitle("section", "");
  clearLookNote();
  if (pairCooldownTimer !== null) {
    clearTimeout(pairCooldownTimer);
    pairCooldownTimer = null;
  }
  window.removeEventListener("beforeunload", flushQueuedOverridesOnPageClose);
  window.removeEventListener("pagehide", flushQueuedOverridesOnPageClose);
  flushQueuedOverrides();
  if (!narrowMql) return;
  if (typeof narrowMql.removeEventListener === "function") {
    narrowMql.removeEventListener("change", onNarrowChange);
  } else if (typeof narrowMql.removeListener === "function") {
    narrowMql.removeListener(onNarrowChange);
  }
});
</script>
