import { useState, useEffect } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { useJournalStore } from '@/store/journal-store'
import { SENTIMENT_COLORS, type Sentiment } from '@/types/journal'
import { Pie } from 'react-chartjs-2'
import { Chart as ChartJS, ArcElement, Tooltip, Legend } from 'chart.js'

// Register Chart.js components
ChartJS.register(ArcElement, Tooltip, Legend)

export function StatisticsDialog() {
  const { activeDialog, closeDialog, journalData } = useJournalStore()
  const [selectedYear, setSelectedYear] = useState<number | 'all'>('all')
  const [chartData, setChartData] = useState<any>(null)

  const isOpen = activeDialog === 'statistics'

  // Get available years
  const years = journalData
    ? Array.from(new Set(journalData.en.map((e) => new Date(e.entryDate).getFullYear()))).sort(
        (a, b) => b - a
      )
    : []

  useEffect(() => {
    if (!journalData || !isOpen) return

    // Filter entries by year
    let entries = journalData.en
    if (selectedYear !== 'all') {
      entries = entries.filter((e) => new Date(e.entryDate).getFullYear() === selectedYear)
    }

    // Count sentiments
    const sentimentCounts: Record<string, number> = {}
    entries.forEach((entry) => {
      const sentiment = entry.sentiment
      sentimentCounts[sentiment] = (sentimentCounts[sentiment] || 0) + 1
    })

    // Calculate percentages
    const total = entries.length
    const percentages: Record<string, number> = {}
    Object.keys(sentimentCounts).forEach((sentiment) => {
      percentages[sentiment] = Math.round((sentimentCounts[sentiment] / total) * 100)
    })

    // Prepare chart data
    const labels = Object.keys(percentages)
    const data = Object.values(percentages)
    const backgroundColor = labels.map(
      (label) => SENTIMENT_COLORS[label as Sentiment] || '#999'
    )

    setChartData({
      labels,
      datasets: [
        {
          label: 'Percentage of emotions',
          data,
          backgroundColor
        }
      ]
    })
  }, [selectedYear, journalData, isOpen])

  const handleClose = () => {
    closeDialog()
    setSelectedYear('all')
  }

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Your Statistics</DialogTitle>
          <DialogDescription>
            View insights about your emotional journey over time.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          <div>
            <Label htmlFor="year-filter">Filter by Year</Label>
            <Select
              value={selectedYear.toString()}
              onValueChange={(val) => setSelectedYear(val === 'all' ? 'all' : parseInt(val))}
            >
              <SelectTrigger id="year-filter">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Years</SelectItem>
                {years.map((year) => (
                  <SelectItem key={year} value={year.toString()}>
                    {year}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {chartData && (
            <div className="flex justify-center p-8">
              <div className="w-[400px] h-[400px]">
                <Pie
                  data={chartData}
                  options={{
                    responsive: true,
                    maintainAspectRatio: true,
                    plugins: {
                      legend: {
                        position: 'bottom',
                        labels: {
                          padding: 15,
                          font: {
                            size: 12
                          }
                        }
                      },
                      tooltip: {
                        callbacks: {
                          label: function (context) {
                            return `${context.label}: ${context.parsed}%`
                          }
                        }
                      }
                    }
                  }}
                />
              </div>
            </div>
          )}

          {!chartData && (
            <div className="text-center text-muted-foreground py-8">
              No data available for the selected period.
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
