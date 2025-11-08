import { useModeStore } from '../stores/mode'
import { useCalendarStore } from '../stores/calendar'
import { useImagesStore } from '../stores/images'
import { useWebServicesStore } from '../stores/webServices'
import { useRouter } from 'vue-router'

/**
 * Composable for handling keyboard actions.
 * Maps keyboard actions to actual functions.
 */
export function useKeyboardActions() {
  const modeStore = useModeStore()
  const calendarStore = useCalendarStore()
  const imagesStore = useImagesStore()
  const webServicesStore = useWebServicesStore()
  const router = useRouter()

  const handleAction = (action) => {
    // Handle generic actions that adapt to current mode
    if (action === 'generic_next') {
      action = getGenericNextAction()
    } else if (action === 'generic_prev') {
      action = getGenericPrevAction()
    } else if (action === 'generic_expand_close') {
      action = getGenericExpandCloseAction()
    }

    switch (action) {
      // Mode switching
      case 'mode_calendar':
        modeStore.setMode(modeStore.MODES.CALENDAR)
        router.push('/')
        break
      case 'mode_photos':
        modeStore.setMode(modeStore.MODES.PHOTOS)
        router.push('/')
        break
      case 'mode_web_services':
        modeStore.setMode(modeStore.MODES.WEB_SERVICES)
        router.push('/')
        break
      case 'mode_spare':
        // Spare button for future use - currently does nothing
        // Can be mapped to any action later
        break
      case 'mode_settings':
        modeStore.setMode(modeStore.MODES.SETTINGS)
        router.push('/settings')
        break
      case 'mode_cycle':
        modeStore.cycleMode()
        if (modeStore.currentMode === modeStore.MODES.SETTINGS) {
          router.push('/settings')
        } else {
          router.push('/')
        }
        break

      // Calendar actions
      case 'calendar_next_month':
        if (modeStore.currentMode === modeStore.MODES.CALENDAR) {
          const newDate = new Date(calendarStore.currentDate)
          newDate.setMonth(newDate.getMonth() + 1)
          calendarStore.setCurrentDate(newDate)
        }
        break
      case 'calendar_prev_month':
        if (modeStore.currentMode === modeStore.MODES.CALENDAR) {
          const newDate = new Date(calendarStore.currentDate)
          newDate.setMonth(newDate.getMonth() - 1)
          calendarStore.setCurrentDate(newDate)
        }
        break
      case 'calendar_expand_today':
        // Expand all events for today - show all details for all events
        if (modeStore.currentMode === modeStore.MODES.CALENDAR) {
          const today = new Date()
          today.setHours(0, 0, 0, 0)
          
          // Helper to get calendar date components
          const getDateComponents = (date) => {
            const d = new Date(date)
            return { year: d.getFullYear(), month: d.getMonth(), day: d.getDate() }
          }
          
          // Helper to compare date components
          const compareDateComponents = (date1, date2) => {
            if (date1.year !== date2.year) return date1.year - date2.year
            if (date1.month !== date2.month) return date1.month - date2.month
            return date1.day - date2.day
          }
          
          const todayComponents = getDateComponents(today)
          
          // Get all events for today (including multi-day events that span today)
          const todayEvents = calendarStore.events.filter((event) => {
            const eventStart = new Date(event.start)
            const eventEnd = new Date(event.end)
            
            if (event.all_day) {
              // All-day events: compare calendar date components
              const eStartComponents = getDateComponents(eventStart)
              const durationMs = eventEnd.getTime() - eventStart.getTime()
              const durationDays = Math.floor(durationMs / (1000 * 60 * 60 * 24))
              const eEndDate = new Date(eventStart)
              eEndDate.setDate(eventStart.getDate() + durationDays)
              const eEndComponents = getDateComponents(eEndDate)
              
              const startCompare = compareDateComponents(eStartComponents, todayComponents)
               
              const endCompare = compareDateComponents(todayComponents, eEndComponents)
              return startCompare <= 0 && endCompare <= 0
            } else {
              // Timed events: check if event overlaps with today
              const eStartComponents = getDateComponents(eventStart)
              const eEndComponents = getDateComponents(eventEnd)
              
              const startCompare = compareDateComponents(eStartComponents, todayComponents)
              const endCompare = compareDateComponents(todayComponents, eEndComponents)
              return startCompare <= 0 && endCompare <= 0
            }
          })
          
          if (todayEvents.length > 0) {
            // Set flag to show all events' details
            calendarStore.setShowAllDayEvents(true)
            // Expand the first event (the panel will show all events' details)
            calendarStore.selectEvent(todayEvents[0])
          }
        }
        break
      case 'calendar_collapse':
        if (modeStore.currentMode === modeStore.MODES.CALENDAR) {
          calendarStore.clearSelectedEvent()
        }
        break

      // Image actions
      case 'images_next':
        // Works in photos mode or fullscreen photos
        if (modeStore.currentMode === modeStore.MODES.PHOTOS || 
            (modeStore.isFullscreen && modeStore.fullscreenMode === modeStore.MODES.PHOTOS) ||
            modeStore.currentMode === modeStore.MODES.CALENDAR) {
          imagesStore.nextImage()
        }
        break
      case 'images_prev':
        // Works in photos mode or fullscreen photos
        if (modeStore.currentMode === modeStore.MODES.PHOTOS || 
            (modeStore.isFullscreen && modeStore.fullscreenMode === modeStore.MODES.PHOTOS) ||
            modeStore.currentMode === modeStore.MODES.CALENDAR) {
          imagesStore.previousImage()
        }
        break
      case 'photos_enter_fullscreen':
        // Enter fullscreen photos mode
        if (modeStore.currentMode === modeStore.MODES.PHOTOS || modeStore.currentMode === modeStore.MODES.CALENDAR) {
          modeStore.enterFullscreen(modeStore.MODES.PHOTOS)
          router.push('/')
        }
        break
      case 'photos_exit_fullscreen':
        // Exit fullscreen - return to dashboard
        if (modeStore.isFullscreen && modeStore.fullscreenMode === modeStore.MODES.PHOTOS) {
          modeStore.exitFullscreen()
          router.push('/')
        }
        break

      // Web service actions
      case 'web_service_1':
        if (modeStore.currentMode === modeStore.MODES.WEB_SERVICES) {
          // Switch to first web service (index 0)
          webServicesStore.setServiceIndex(0)
        } else {
          modeStore.setMode(modeStore.MODES.WEB_SERVICES)
          router.push('/')
        }
        break
      case 'web_service_2':
        if (modeStore.currentMode === modeStore.MODES.WEB_SERVICES) {
          // Switch to second web service (index 1)
          webServicesStore.setServiceIndex(1)
        } else {
          modeStore.setMode(modeStore.MODES.WEB_SERVICES)
          router.push('/')
        }
        break
      case 'web_service_next':
        // Works in web services mode or fullscreen web services
        if (modeStore.currentMode === modeStore.MODES.WEB_SERVICES || 
            (modeStore.isFullscreen && modeStore.fullscreenMode === modeStore.MODES.WEB_SERVICES)) {
          webServicesStore.nextService()
        } else {
          // Switch to web services mode (side view)
          modeStore.setMode(modeStore.MODES.WEB_SERVICES)
          router.push('/')
        }
        break
      case 'web_service_prev':
        // Works in web services mode or fullscreen web services
        if (modeStore.currentMode === modeStore.MODES.WEB_SERVICES || 
            (modeStore.isFullscreen && modeStore.fullscreenMode === modeStore.MODES.WEB_SERVICES)) {
          webServicesStore.previousService()
        } else {
          // Switch to web services mode (side view)
          modeStore.setMode(modeStore.MODES.WEB_SERVICES)
          router.push('/')
        }
        break
      case 'web_service_close':
        // Close web services fullscreen - return to dashboard
        if (modeStore.isFullscreen && modeStore.fullscreenMode === modeStore.MODES.WEB_SERVICES) {
          modeStore.exitFullscreen()
          router.push('/')
        }
        break
      case 'web_service_enter_fullscreen':
        // Enter fullscreen web services mode
        if (modeStore.currentMode === modeStore.MODES.WEB_SERVICES) {
          modeStore.enterFullscreen(modeStore.MODES.WEB_SERVICES)
          router.push('/')
        }
        break

      case 'none':
        // No action
        break

      default:
        console.warn(`Unknown keyboard action: ${action}`)
    }
  }

  // Get the appropriate action for generic_next based on current mode
  const getGenericNextAction = () => {
    // If in fullscreen, use fullscreen mode; otherwise use current mode
    const activeMode = modeStore.isFullscreen ? modeStore.fullscreenMode : modeStore.currentMode
    
    if (activeMode === modeStore.MODES.CALENDAR) {
      return 'calendar_next_month'
    } else if (activeMode === modeStore.MODES.PHOTOS) {
      return 'images_next'
    } else if (activeMode === modeStore.MODES.WEB_SERVICES) {
      return 'web_service_next'
    } else {
      return 'none' // No action for other modes
    }
  }

  // Get the appropriate action for generic_prev based on current mode
  const getGenericPrevAction = () => {
    // If in fullscreen, use fullscreen mode; otherwise use current mode
    const activeMode = modeStore.isFullscreen ? modeStore.fullscreenMode : modeStore.currentMode
    
    if (activeMode === modeStore.MODES.CALENDAR) {
      return 'calendar_prev_month'
    } else if (activeMode === modeStore.MODES.PHOTOS) {
      return 'images_prev'
    } else if (activeMode === modeStore.MODES.WEB_SERVICES) {
      return 'web_service_prev'
    } else {
      return 'none' // No action for other modes
    }
  }

  // Get the appropriate action for generic_expand_close based on current mode
  const getGenericExpandCloseAction = () => {
    // Check if we're in fullscreen mode first
    if (modeStore.isFullscreen) {
      if (modeStore.fullscreenMode === modeStore.MODES.PHOTOS) {
        return 'photos_exit_fullscreen'
      } else if (modeStore.fullscreenMode === modeStore.MODES.WEB_SERVICES) {
        return 'web_service_close'
      }
    }
    
    const currentMode = modeStore.currentMode
    if (currentMode === modeStore.MODES.CALENDAR) {
      // Check if event is expanded - if so, close it; otherwise expand today
      if (calendarStore.selectedEvent) {
        return 'calendar_collapse'
      } else {
        return 'calendar_expand_today'
      }
    } else if (currentMode === modeStore.MODES.PHOTOS) {
      // Enter fullscreen photos
      return 'photos_enter_fullscreen'
    } else if (currentMode === modeStore.MODES.WEB_SERVICES) {
      // Enter fullscreen web services
      return 'web_service_enter_fullscreen'
    } else {
      return 'none' // No action for other modes
    }
  }

  return {
    handleAction,
  }
}

