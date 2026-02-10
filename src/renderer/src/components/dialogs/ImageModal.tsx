import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { VisuallyHidden } from '@radix-ui/react-visually-hidden'

interface ImageModalProps {
  imageUrl: string | null
  onClose: () => void
}

export function ImageModal({ imageUrl, onClose }: ImageModalProps) {
  return (
    <Dialog open={!!imageUrl} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-[95vw] max-h-[95vh] p-0 overflow-hidden">
        <VisuallyHidden>
          <DialogTitle>Image Viewer</DialogTitle>
          <DialogDescription>View attachment image in full size</DialogDescription>
        </VisuallyHidden>

        <div className="relative w-full h-full flex items-center justify-center bg-black/90">
          {/* Close button */}
          <Button
            variant="ghost"
            size="icon"
            className="absolute top-4 right-4 z-10 text-white hover:bg-white/20"
            onClick={onClose}
          >
            <X className="h-6 w-6" />
          </Button>

          {/* Image */}
          {imageUrl && (
            <img
              src={imageUrl}
              alt="Full size attachment"
              className="max-w-full max-h-[90vh] object-contain"
              onClick={onClose}
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
