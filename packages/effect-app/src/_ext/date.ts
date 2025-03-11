import { addDays, addHours, addMinutes, addMonths, addSeconds, addWeeks, addYears, subDays, subHours, subMinutes, subMonths, subSeconds, subWeeks, subYears } from "date-fns"

export const DateAddDays: (date: Date, amount: number) => Date = addDays
export const DateSubDays: (date: Date, amount: number) => Date = subDays

export const DateAddHours: (date: Date, amount: number) => Date = addHours
export const DateSubHours: (date: Date, amount: number) => Date = subHours

export const DateAddMinutes: (date: Date, amount: number) => Date = addMinutes

export const DateSubMinutes: (date: Date, amount: number) => Date = subMinutes

export const DateAddSeconds: (date: Date, amount: number) => Date = addSeconds

export const DateSubSeconds: (date: Date, amount: number) => Date = subSeconds

export const DateAddYears: (date: Date, amount: number) => Date = addYears

export const DateSubYears: (date: Date, amount: number) => Date = subYears

export const DateAddMonths: (date: Date, amount: number) => Date = addMonths

export const DateSubMonths: (date: Date, amount: number) => Date = subMonths

export const DateAddWeeks: (date: Date, amount: number) => Date = addWeeks

export const DateSubWeeks: (date: Date, amount: number) => Date = subWeeks
