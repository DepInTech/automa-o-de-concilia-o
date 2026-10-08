import { useState } from 'react'
import { UploadCloud, FileSpreadsheet, FileText, Download } from 'lucide-react'

interface UploadZoneProps {
  title: string
  subtitle?: string
  id: string
  file: File | null
  onChange: (f: File) => void
  onDownloadSample?: () => void
  acceptType?: 'spreadsheet' | 'pdf'
  description?: string
  badgeText?: string
  subDescription?: string
}

export function UploadZone({
  title,
  subtitle: _subtitle,
  id,
  file,
  onChange,
  onDownloadSample,
  acceptType = 'spreadsheet',
  description,
  badgeText,
  subDescription,
}: UploadZoneProps) {
  const [isDragOver, setIsDragOver] = useState(false)
  const isPdf = acceptType === 'pdf'

  const acceptMime = isPdf
    ? 'application/pdf, .pdf'
    : '.xlsx, .csv, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, text/csv'

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setIsDragOver(false)
    const droppedFile = e.dataTransfer.files?.[0]
    if (droppedFile) {
      onChange(droppedFile)
    }
  }

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setIsDragOver(true)
  }

  const handleDragLeave = () => {
    setIsDragOver(false)
  }

  return (
    <div
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      className={`border-2 border-dashed rounded-2xl p-6 sm:p-8 flex flex-col items-center justify-center text-center transition-all relative group h-80 shadow-sm ${
        isDragOver
          ? 'border-[#00796F] bg-[#DDF5F0]/40 dark:bg-[#00796F]/20 scale-[1.01]'
          : isPdf
            ? 'border-rose-300/60 dark:border-rose-900/40 bg-white dark:bg-[#0D3834] hover:bg-rose-50/30 dark:hover:bg-rose-950/10 hover:border-rose-400 dark:hover:border-rose-700'
            : 'border-[#008F83]/30 dark:border-[#008F83]/40 bg-white dark:bg-[#0D3834] hover:bg-[#DDF5F0]/20 dark:hover:bg-[#008F83]/10 hover:border-[#008F83] dark:hover:border-[#20C9A6]'
      }`}
    >
      <input
        type="file"
        id={id}
        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
        accept={acceptMime}
        onChange={(e) => e.target.files?.[0] && onChange(e.target.files[0])}
      />

      {file ? (
        <div className="animate-fade-in flex flex-col items-center max-w-[280px]">
          <div
            className={`w-16 h-16 rounded-2xl flex items-center justify-center mb-3 shadow-sm ${
              isPdf
                ? 'bg-rose-100 dark:bg-rose-950/40 border border-rose-300/60 text-rose-600 dark:text-rose-400'
                : 'bg-[#DDF5F0] dark:bg-[#008F83]/20 border border-[#008F83]/30 text-[#008F83] dark:text-[#20C9A6]'
            }`}
          >
            {isPdf ? <FileText className="w-8 h-8" /> : <FileSpreadsheet className="w-8 h-8" />}
          </div>
          <div
            className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold mb-2 ${
              isPdf
                ? 'bg-rose-100/70 dark:bg-rose-950/50 text-rose-700 dark:text-rose-300'
                : 'bg-[#DDF5F0] dark:bg-[#008F83]/20 text-[#006B67] dark:text-[#20C9A6]'
            }`}
          >
            <span
              className={`w-1.5 h-1.5 rounded-full ${isPdf ? 'bg-rose-500' : 'bg-[#008F83] dark:bg-[#20C9A6]'}`}
            />
            {isPdf ? 'PDF Carregado (Leitura Automática)' : 'Planilha Carregada'}
          </div>
          <h3
            className="font-bold text-base text-[#12343B] dark:text-[#F1F5F4] truncate w-full"
            title={file.name}
          >
            {file.name}
          </h3>
          <p className="text-xs text-[#64748B] dark:text-[#A7C4C0] mt-1 font-medium">
            {(file.size / 1024).toFixed(1)} KB •{' '}
            {isPdf ? 'Pronto para extração' : 'Pronto para processar'}
          </p>
          <p
            className={`text-xs font-semibold mt-3 opacity-90 group-hover:underline ${
              isPdf ? 'text-rose-600 dark:text-rose-400' : 'text-[#008F83] dark:text-[#20C9A6]'
            }`}
          >
            Clique para substituir arquivo
          </p>
        </div>
      ) : (
        <div className="flex flex-col items-center">
          <div
            className={`w-16 h-16 rounded-2xl flex items-center justify-center mb-3 group-hover:scale-105 transition-all shadow-sm ${
              isPdf
                ? 'bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/40 text-rose-600 dark:text-rose-400 group-hover:bg-rose-100 dark:group-hover:bg-rose-900/50'
                : 'bg-[#F5F8F8] dark:bg-[#071F1D] border border-[#008F83]/20 text-[#008F83] dark:text-[#20C9A6] group-hover:bg-[#DDF5F0] dark:group-hover:bg-[#008F83]/30'
            }`}
          >
            {isPdf ? <FileText className="w-8 h-8" /> : <UploadCloud className="w-8 h-8" />}
          </div>

          <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-wider mb-1.5 bg-[#F4F8F7] dark:bg-[#071F1D] text-[#647875] dark:text-[#A7C4C0]">
            {badgeText || (isPdf ? 'Fatura em PDF' : 'Planilha do Sistema')}
          </div>

          <h3 className="font-bold text-lg text-[#12343B] dark:text-[#F1F5F4] mb-1">{title}</h3>

          <p className="text-xs text-[#647875] dark:text-[#A7C4C0] max-w-[280px] leading-relaxed font-medium">
            {description ||
              (isPdf
                ? 'Envie a fatura original do cartão em PDF.'
                : 'Envie a planilha exportada do sistema Odoo.')}
          </p>

          {subDescription && (
            <p className="text-[11px] text-[#8C9E9B] dark:text-[#7A9894] max-w-[260px] mt-0.5">
              {subDescription}
            </p>
          )}

          <div
            className={`mt-2.5 px-3 py-1 rounded-md text-[11px] font-semibold border ${
              isPdf
                ? 'bg-rose-50/80 dark:bg-rose-950/30 text-rose-700 dark:text-rose-300 border-rose-200/60 dark:border-rose-900/30'
                : 'bg-[#F4F8F7] dark:bg-[#071F1D] text-[#004A46] dark:text-[#20BFA9] border-[#00796F]/20'
            }`}
          >
            {isPdf ? 'Formato aceito: PDF' : 'Formatos aceitos: .xlsx e .csv'}
          </div>

          {!isPdf && onDownloadSample && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                onDownloadSample()
              }}
              className="mt-3 inline-flex items-center gap-1.5 text-xs text-[#006B67] dark:text-[#20C9A6] hover:text-[#008F83] font-semibold px-3 py-1.5 rounded-lg bg-[#DDF5F0]/60 dark:bg-[#008F83]/20 hover:bg-[#DDF5F0] dark:hover:bg-[#008F83]/30 transition-all z-20"
            >
              <Download className="w-3.5 h-3.5" /> Baixar modelo CSV
            </button>
          )}
        </div>
      )}
    </div>
  )
}
