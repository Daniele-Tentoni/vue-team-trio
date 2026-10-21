import { h } from 'vue'
import { createVuetify } from 'vuetify'
import type { IconProps, IconSet } from 'vuetify'
import { md3 } from 'vuetify/blueprints'
import {
    VAlert,
    VApp,
    VBtn,
    VBtnToggle,
    VCard,
    VChip,
    VSelect,
    VTextarea,
    VTextField,
} from 'vuetify/components'
import { aliases } from 'vuetify/iconsets/mdi'
import { it } from 'vuetify/locale'
import {
    Check,
    ChevronDown,
    ChevronLeft,
    ChevronRight,
    ChevronUp,
    CircleAlert,
    CircleCheck,
    CircleHelp,
    Info,
    TriangleAlert,
    X,
} from '@lucide/vue'
import type { Component } from 'vue'

const icons: Record<string, Component> = {
    check: Check,
    'chevron-down': ChevronDown,
    'chevron-left': ChevronLeft,
    'chevron-right': ChevronRight,
    'chevron-up': ChevronUp,
    'circle-alert': CircleAlert,
    'circle-check': CircleCheck,
    info: Info,
    'triangle-alert': TriangleAlert,
    x: X,
}

const lucide: IconSet = {
    component: (props: IconProps) =>
        h(props.tag, [
            h(icons[String(props.icon)] ?? CircleHelp, { size: 20, 'aria-hidden': 'true' }),
        ]),
}

export default createVuetify({
    blueprint: md3,
    components: { VAlert, VApp, VBtn, VBtnToggle, VCard, VChip, VSelect, VTextarea, VTextField },
    locale: { locale: 'it', fallback: 'it', messages: { it } },
    theme: {
        defaultTheme: 'trio',
        themes: {
            trio: {
                dark: false,
                colors: {
                    primary: '#176c52',
                    'on-primary': '#ffffff',
                    secondary: '#546b82',
                    'on-secondary': '#ffffff',
                    'primary-container': '#d2eadc',
                    'on-primary-container': '#123e2b',
                    'secondary-container': '#dce5ee',
                    'on-secondary-container': '#253c51',
                    surface: '#ffffff',
                    'surface-variant': '#e4e9e1',
                    'on-surface': '#26322f',
                    'on-surface-variant': '#55634f',
                    background: '#f7f8f5',
                    error: '#ba1a1a',
                    success: '#176c52',
                    warning: '#916214',
                    info: '#326580',
                    outline: '#788574',
                },
            },
        },
    },
    icons: {
        defaultSet: 'lucide',
        aliases: {
            ...aliases,
            complete: 'check',
            cancel: 'x',
            close: 'x',
            clear: 'x',
            delete: 'x',
            success: 'circle-check',
            info: 'info',
            warning: 'triangle-alert',
            error: 'circle-alert',
            prev: 'chevron-left',
            next: 'chevron-right',
            expand: 'chevron-down',
            collapse: 'chevron-up',
            dropdown: 'chevron-down',
        },
        sets: { lucide },
    },
})
