import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ScrollArea } from '@/components/ui/scroll-area'

interface EmojiPickerProps {
  onSelect: (emoji: string) => void
}

// Simple emoji shortcode list - in a real implementation, you'd load from emoji directory
const EMOJI_CATEGORIES = {
  Faces: [
    { shortcode: ':smile:', emoji: '😊' },
    { shortcode: ':laughing:', emoji: '😆' },
    { shortcode: ':heart_eyes:', emoji: '😍' },
    { shortcode: ':thinking:', emoji: '🤔' },
    { shortcode: ':cry:', emoji: '😢' },
    { shortcode: ':angry:', emoji: '😠' },
    { shortcode: ':wink:', emoji: '😉' },
    { shortcode: ':neutral:', emoji: '😐' }
  ],
  Activity: [
    { shortcode: ':running:', emoji: '🏃' },
    { shortcode: ':swimming:', emoji: '🏊' },
    { shortcode: ':cycling:', emoji: '🚴' },
    { shortcode: ':soccer:', emoji: '⚽' },
    { shortcode: ':basketball:', emoji: '🏀' }
  ],
  Food: [
    { shortcode: ':pizza:', emoji: '🍕' },
    { shortcode: ':burger:', emoji: '🍔' },
    { shortcode: ':coffee:', emoji: '☕' },
    { shortcode: ':cake:', emoji: '🍰' },
    { shortcode: ':apple:', emoji: '🍎' }
  ],
  Nature: [
    { shortcode: ':dog:', emoji: '🐕' },
    { shortcode: ':cat:', emoji: '🐈' },
    { shortcode: ':tree:', emoji: '🌲' },
    { shortcode: ':flower:', emoji: '🌸' },
    { shortcode: ':sun:', emoji: '☀️' }
  ],
  Objects: [
    { shortcode: ':book:', emoji: '📖' },
    { shortcode: ':phone:', emoji: '📱' },
    { shortcode: ':computer:', emoji: '💻' },
    { shortcode: ':camera:', emoji: '📷' },
    { shortcode: ':gift:', emoji: '🎁' }
  ],
  Symbols: [
    { shortcode: ':heart:', emoji: '❤️' },
    { shortcode: ':star:', emoji: '⭐' },
    { shortcode: ':fire:', emoji: '🔥' },
    { shortcode: ':check:', emoji: '✅' },
    { shortcode: ':warning:', emoji: '⚠️' }
  ],
  Travel: [
    { shortcode: ':airplane:', emoji: '✈️' },
    { shortcode: ':car:', emoji: '🚗' },
    { shortcode: ':train:', emoji: '🚂' },
    { shortcode: ':house:', emoji: '🏠' },
    { shortcode: ':beach:', emoji: '🏖️' }
  ],
  Other: [
    { shortcode: ':thumbsup:', emoji: '👍' },
    { shortcode: ':thumbsdown:', emoji: '👎' },
    { shortcode: ':clap:', emoji: '👏' },
    { shortcode: ':wave:', emoji: '👋' },
    { shortcode: ':ok_hand:', emoji: '👌' }
  ]
}

export function EmojiPicker({ onSelect }: EmojiPickerProps) {
  return (
    <Tabs defaultValue="Faces" className="w-full">
      <TabsList className="grid w-full grid-cols-4 lg:grid-cols-8">
        {Object.keys(EMOJI_CATEGORIES).map((category) => (
          <TabsTrigger key={category} value={category} className="text-xs">
            {category}
          </TabsTrigger>
        ))}
      </TabsList>
      {Object.entries(EMOJI_CATEGORIES).map(([category, emojis]) => (
        <TabsContent key={category} value={category}>
          <ScrollArea className="h-[200px] w-full rounded-md border p-4">
            <div className="grid grid-cols-8 gap-2">
              {emojis.map(({ shortcode, emoji }) => (
                <button
                  key={shortcode}
                  onClick={() => onSelect(shortcode)}
                  className="text-2xl hover:bg-accent rounded p-2 transition-colors"
                  title={shortcode}
                >
                  {emoji}
                </button>
              ))}
            </div>
          </ScrollArea>
        </TabsContent>
      ))}
    </Tabs>
  )
}
