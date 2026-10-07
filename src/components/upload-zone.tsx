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
    <div className="border-2 border-dashed border-[#008F83]/30 dark:border-[#008F83]/40 bg-white dark:bg-[#0D3834] rounded-2xl p-8 flex flex-col items-center justify-center text-center hover:bg-[#DDF5F0]/20 dark:hover:bg-[#008F83]/10 hover:border-[#008F83] dark:hover:border-[#20C9A6] transition-all relative group h-72 shadow-sm">
      <input
        type="file"
        id={id}
        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
        accept=".csv, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/vnd.ms-excel"
        onChange={(e) => e.target.files?.[0] && onChange(e.target.files[0])}
      />
      {file ? (
        <div className="animate-fade-in flex flex-col items-center max-w-[280px]">
          <div className="w-16 h-16 bg-[#DDF5F0] dark:bg-[#008F83]/20 border border-[#008F83]/30 rounded-2xl flex items-center justify-center mb-3 text-[#008F83] dark:text-[#20C9A6] shadow-sm">
            <FileSpreadsheet className="w-8 h-8" />
          </div>
          <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-[#DDF5F0] dark:bg-[#008F83]/20 text-[#006B67] dark:text-[#20C9A6] text-xs font-semibold mb-2">
            <span className="w-1.5 h-1.5 rounded-full bg-[#008F83] dark:bg-[#20C9A6]" />
            Arquivo Carregado
          </div>
          <h3
            className="font-bold text-base text-[#12343B] dark:text-[#F1F5F4] truncate w-full"
            title={file.name}
          >
            {file.name}
          </h3>
          <p className="text-xs text-[#64748B] dark:text-[#A7C4C0] mt-1 font-medium">
            {(file.size / 1024).toFixed(1)} KB • Pronto para processar
          </p>
          <p className="text-xs text-[#008F83] dark:text-[#20C9A6] font-semibold mt-3 opacity-90 group-hover:underline">
            Clique para substituir arquivo
          </p>
        </div>
      ) : (
        <div className="flex flex-col items-center">
          <div className="w-16 h-16 bg-[#F5F8F8] dark:bg-[#071F1D] border border-[#008F83]/20 rounded-2xl flex items-center justify-center mb-3 text-[#008F83] dark:text-[#20C9A6] group-hover:scale-105 group-hover:bg-[#DDF5F0] dark:group-hover:bg-[#008F83]/30 transition-all shadow-sm">
            <UploadCloud className="w-8 h-8" />
          </div>
          <h3 className="font-bold text-lg text-[#12343B] dark:text-[#F1F5F4] mb-1">{title}</h3>
          <p className="text-xs text-[#64748B] dark:text-[#A7C4C0] max-w-[240px] leading-relaxed">
            Arraste seu arquivo Excel (.xlsx) ou CSV aqui ou clique para buscar
          </p>
          {onDownloadSample && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                onDownloadSample()
              }}
              className="mt-4 inline-flex items-center gap-1.5 text-xs text-[#006B67] dark:text-[#20C9A6] hover:text-[#008F83] font-semibold px-3 py-1.5 rounded-lg bg-[#DDF5F0]/60 dark:bg-[#008F83]/20 hover:bg-[#DDF5F0] dark:hover:bg-[#008F83]/30 transition-all z-20"
            >
              <Download className="w-3.5 h-3.5" /> Baixar modelo CSV
            </button>
          )}
        </div>
      )}
    </div>
  )
}
