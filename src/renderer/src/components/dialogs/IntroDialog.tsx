import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { useJournalStore } from '@/store/journal-store'
import { ChevronLeft, ChevronRight } from 'lucide-react'

const STEPS = [
  {
    title: 'Welcome to JournalBear!',
    content: (
      <div className="space-y-4">
        <p>JournalBear is a secure, encrypted journaling application that keeps your thoughts private.</p>
        <p>This quick tutorial will help you get started.</p>
      </div>
    )
  },
  {
    title: 'Creating Your First Entry',
    content: (
      <div className="space-y-4">
        <p>To create a new entry:</p>
        <ol className="list-decimal list-inside space-y-2">
          <li>Click "Entry" → "New Entry" in the menu</li>
          <li>Select a date and how you're feeling</li>
          <li>Write your entry using Markdown formatting</li>
          <li>Add emoji and images if you'd like</li>
          <li>Click "Add Entry" to save</li>
        </ol>
      </div>
    )
  },
  {
    title: 'Markdown Formatting',
    content: (
      <div className="space-y-4">
        <p>JournalBear supports Markdown for rich text formatting:</p>
        <ul className="list-disc list-inside space-y-2">
          <li>*italic* or _italic_</li>
          <li>**bold** or __bold__</li>
          <li>[link text](url)</li>
          <li>~~strikethrough~~</li>
          <li># Heading 1, ## Heading 2, etc.</li>
          <li>- Bullet lists</li>
          <li>1. Numbered lists</li>
        </ul>
      </div>
    )
  },
  {
    title: 'Security & Encryption',
    content: (
      <div className="space-y-4">
        <p>Your journal is protected with AES-256 encryption:</p>
        <ul className="list-disc list-inside space-y-2">
          <li>All entries are encrypted with your password</li>
          <li>No one can read your journal without the password</li>
          <li>Choose a strong, memorable password</li>
          <li>Your password cannot be recovered if lost</li>
        </ul>
        <p className="font-semibold">Always remember your password!</p>
      </div>
    )
  }
]

export function IntroDialog() {
  const { activeDialog, closeDialog } = useJournalStore()
  const [currentStep, setCurrentStep] = useState(0)
  const isOpen = activeDialog === 'intro'

  const handleClose = () => {
    closeDialog()
    setCurrentStep(0)
  }

  const handleNext = () => {
    if (currentStep < STEPS.length - 1) {
      setCurrentStep(currentStep + 1)
    } else {
      handleClose()
    }
  }

  const handlePrevious = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1)
    }
  }

  const currentStepData = STEPS[currentStep]

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{currentStepData.title}</DialogTitle>
        </DialogHeader>

        <div className="py-6 min-h-[300px]">{currentStepData.content}</div>

        <div className="flex items-center justify-between">
          <div className="text-sm text-muted-foreground">
            Step {currentStep + 1} of {STEPS.length}
          </div>
          <div className="flex gap-2">
            {currentStep > 0 && (
              <Button variant="outline" onClick={handlePrevious}>
                <ChevronLeft className="h-4 w-4 mr-1" />
                Previous
              </Button>
            )}
            <Button onClick={handleNext}>
              {currentStep === STEPS.length - 1 ? (
                'Get Started'
              ) : (
                <>
                  Next
                  <ChevronRight className="h-4 w-4 ml-1" />
                </>
              )}
            </Button>
          </div>
        </div>

        <div className="flex gap-1 justify-center">
          {STEPS.map((_, idx) => (
            <div
              key={idx}
              className={`h-1.5 w-8 rounded-full transition-colors ${
                idx === currentStep ? 'bg-primary' : 'bg-muted'
              }`}
            />
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}
