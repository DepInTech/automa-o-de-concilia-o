import { UploadCloud, FileSpreadsheet, Download } from 'lucide-react'

interface UploadZoneProps {
  title: string
  id: string
  file: File | null
  onChange: (f: File) => void
  onDownloadSample?: () => void
}

export function UploadZone({ title, id, file, onChange, onDownloadSample }: UploadZoneProps) {
  return (
    <div className="border-2 border-dashed border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 rounded-2xl p-10 flex flex-col items-center justify-center text-center hover:bg-slate-50 dark:hover:bg-slate-900/50 hover:border-blue-400 transition-all relative group h-72 shadow-sm">
      <input
        type="file"
        id={id}
        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
        accept=".csv, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/vnd.ms-excel"
        onChange={(e) => e.target.files?.[0] && onChange(e.target.files[0])}
      />
      {file ? (
        <div className="animate-fade-in flex flex-col items-center">
          <div className="w-16 h-16 bg-blue-100 dark:bg-blue-900/30 rounded-full flex items-center justify-center mb-4 text-blue-600">
            <FileSpreadsheet className="w-8 h-8" />
          </div>
          <h3 className="font-bold text-lg text-slate-800 dark:text-white mb-1">Arquivo Pronto</h3>
          <p className="text-sm text-slate-500 font-medium">{file.name}</p>
          <p className="text-xs text-blue-500 font-semibold mt-4 opacity-0 group-hover:opacity-100 transition-opacity">
            Clique para trocar
          </p>
        </div>
      ) : (
        <div className="flex flex-col items-center opacity-80 group-hover:opacity-100 transition-opacity">
          <div className="w-16 h-16 bg-slate-100 dark:bg-slate-800 rounded-full flex items-center justify-center mb-4 text-slate-400 group-hover:text-blue-500 group-hover:bg-blue-50 dark:group-hover:bg-blue-900/30 transition-colors">
            <UploadCloud className="w-8 h-8" />
          </div>
          <h3 className="font-bold text-lg text-slate-800 dark:text-white mb-2">{title}</h3>
          <p className="text-sm text-slate-500 max-w-[200px]">
            Arraste seu arquivo Excel (.xlsx) ou CSV aqui ou clique para buscar
          </p>
          {onDownloadSample && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                onDownloadSample()
              }}
              className="mt-3 text-xs text-blue-600 hover:text-blue-700 font-semibold flex items-center gap-1 transition-colors z-20"
            >
              <Download className="w-3 h-3" /> Baixar modelo CSV
            </button>
          )}
        </div>
      )}
    </div>
  )
}
