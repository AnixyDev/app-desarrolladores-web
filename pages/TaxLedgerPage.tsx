
import React, { useState, useMemo } from 'react';
import Card, { CardContent, CardHeader } from '../components/ui/Card';
import { useAppStore } from '../hooks/useAppStore';
import { formatCurrency } from '../lib/utils';
import { BookIcon, AlertTriangleIcon, DownloadIcon } from '../components/icons/Icon';
import Input from '../components/ui/Input';
import Button from '../components/ui/Button';

const TaxLedgerPage: React.FC = () => {
    const { invoices, expenses, clients } = useAppStore();
    const [year, setYear] = useState(new Date().getFullYear());
    const [quarter, setQuarter] = useState(Math.floor(new Date().getMonth() / 3) + 1);
    const [irpfPercentage, setIrpfPercentage] = useState(20);

    const availableYears = useMemo(() => {
        const allDates = [...invoices.map(i => i.issue_date), ...expenses.map(e => e.date)];
        const years = new Set(allDates.map(d => new Date(d).getFullYear()));
        return Array.from(years).sort((a, b) => b - a);
    }, [invoices, expenses]);

    const filteredData = useMemo(() => {
        const startDate = new Date(year, (quarter - 1) * 3, 1);
        const endDate = new Date(year, quarter * 3, 0);
        // Ajustar fin de día para incluir todas las transacciones del último día
        endDate.setHours(23, 59, 59, 999);

        const filteredInvoices = invoices.filter(i => {
            const issueDate = new Date(i.issue_date);
            return issueDate >= startDate && issueDate <= endDate;
        });
        const filteredExpenses = expenses.filter(e => {
            const expenseDate = new Date(e.date);
            return expenseDate >= startDate && expenseDate <= endDate;
        });

        return { filteredInvoices, filteredExpenses };
    }, [invoices, expenses, year, quarter]);
    
    const totals = useMemo(() => {
        const totalIngresos = filteredData.filteredInvoices.reduce((sum, i) => sum + i.subtotal_cents, 0);
        const totalGastos = filteredData.filteredExpenses.reduce((sum, e) => sum + e.amount_cents, 0);
        
        // El IVA repercutido es la base * el porcentaje, no solo (total - base) porque el total puede estar afectado por IRPF
        const ivaRepercutido = filteredData.filteredInvoices.reduce((sum, i) => sum + (i.subtotal_cents * (i.tax_percent / 100)), 0);
        const ivaSoportado = filteredData.filteredExpenses.reduce((sum, e) => sum + (e.amount_cents * ((e.tax_percent || 0) / 100)), 0);
        
        // Suma de retenciones de IRPF aplicadas en las facturas emitidas (para restar del Modelo 130)
        const totalRetenciones = filteredData.filteredInvoices.reduce((sum, i) => {
            return sum + (i.irpf_percent ? i.subtotal_cents * (i.irpf_percent / 100) : 0);
        }, 0);

        const beneficio = totalIngresos - totalGastos;
        
        // Cálculo Modelo 130 (Pago Fraccionado IRPF - Estimación Directa Simplificada)
        // Generalmente es el 20% del rendimiento neto (Ingresos - Gastos), menos las retenciones soportadas.
        const cuotaIntegra = beneficio > 0 ? beneficio * (irpfPercentage / 100) : 0;
        const irpfAPagar = Math.max(0, cuotaIntegra - totalRetenciones);
        
        return {
            totalIngresos,
            totalGastos,
            beneficio,
            ivaRepercutido,
            ivaSoportado,
            ivaAPagar: ivaRepercutido - ivaSoportado,
            totalRetenciones,
            irpfAPagar,
        }

    }, [filteredData, irpfPercentage]);

    const handleExportCSV = () => {
        const csvRows = [];
        // Header
        csvRows.push(['Fecha', 'Tipo', 'Referencia', 'Tercero', 'Base Imponible', 'IVA %', 'Cuota IVA', 'IRPF %', 'Cuota IRPF', 'Total Neto'].join(','));

        // Procesar Facturas (Ingresos)
        filteredData.filteredInvoices.forEach(inv => {
            const clientName = clients.find(c => c.id === inv.client_id)?.name || 'Cliente desconocido';
            const base = inv.subtotal_cents / 100;
            const ivaQuota = (inv.subtotal_cents * (inv.tax_percent / 100)) / 100;
            const irpfRate = inv.irpf_percent || 0;
            const irpfQuota = (inv.subtotal_cents * (irpfRate / 100)) / 100;
            // Total neto en este contexto contable: Base + IVA - IRPF (liquidez recibida)
            const total = base + ivaQuota - irpfQuota;

            csvRows.push([
                inv.issue_date,
                'Ingreso',
                inv.invoice_number,
                `"${clientName}"`, // Entre comillas por si tiene comas
                base.toFixed(2),
                `${inv.tax_percent}%`,
                ivaQuota.toFixed(2),
                `${irpfRate}%`,
                irpfQuota.toFixed(2),
                total.toFixed(2)
            ].join(','));
        });

        // Procesar Gastos
        filteredData.filteredExpenses.forEach(exp => {
            const base = exp.amount_cents / 100;
            const ivaRate = exp.tax_percent || 0;
            const ivaQuota = base * (ivaRate / 100);
            const total = base + ivaQuota;

            csvRows.push([
                exp.date,
                'Gasto',
                `"${exp.description}"`,
                `"${exp.category}"`,
                base.toFixed(2),
                `${ivaRate}%`,
                ivaQuota.toFixed(2),
                '0%',
                '0.00',
                total.toFixed(2)
            ].join(','));
        });

        const csvString = csvRows.join('\n');
        const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.setAttribute('href', url);
        link.setAttribute('download', `libro_fiscal_${year}_T${quarter}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

  return (
    <div className='space-y-6'>
        <div className="flex flex-col md:flex-row justify-between items-center gap-4">
            <h1 className="text-2xl font-semibold text-white">Libro Fiscal (Estimación Directa)</h1>
            <div className='flex flex-wrap gap-2 items-center bg-gray-900 p-2 rounded-lg'>
                <Button onClick={handleExportCSV} variant="secondary" size="sm" className="mr-2">
                    <DownloadIcon className="w-4 h-4 mr-2" /> Exportar CSV
                </Button>
                <select value={quarter} onChange={e => setQuarter(Number(e.target.value))} className="px-3 py-2 border border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm bg-gray-800 text-white">
                    <option value={1}>1º Trimestre (1T)</option>
                    <option value={2}>2º Trimestre (2T)</option>
                    <option value={3}>3º Trimestre (3T)</option>
                    <option value={4}>4º Trimestre (4T)</option>
                </select>
                 <select value={year} onChange={e => setYear(Number(e.target.value))} className="px-3 py-2 border border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm bg-gray-800 text-white">
                    {availableYears.map(y => <option key={y} value={y}>{y}</option>)}
                </select>
                <div className="w-32">
                     <Input 
                        label="Tipo IRPF (%)" 
                        type="number" 
                        value={irpfPercentage} 
                        onChange={e => setIrpfPercentage(Number(e.target.value))}
                        wrapperClassName="mb-0"
                    />
                </div>
            </div>
      </div>
      
      <Card>
        <CardHeader>
          <h2 className="text-lg font-semibold text-white flex items-center gap-2"><BookIcon className='w-5 h-5'/> Resumen Trimestral</h2>
        </CardHeader>
        <CardContent>
            <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 text-center'>
                <div className='bg-gray-800/50 p-4 rounded-lg border border-gray-700'>
                    <p className='text-sm text-gray-400 mb-1'>Ingresos (Base)</p>
                    <p className='text-2xl font-bold text-green-400'>{formatCurrency(totals.totalIngresos)}</p>
                </div>
                 <div className='bg-gray-800/50 p-4 rounded-lg border border-gray-700'>
                    <p className='text-sm text-gray-400 mb-1'>Gastos (Base)</p>
                    <p className='text-2xl font-bold text-red-400'>{formatCurrency(totals.totalGastos)}</p>
                </div>
                <div className='bg-gray-800/50 p-4 rounded-lg border border-gray-700'>
                    <p className='text-sm text-gray-400 mb-1'>Beneficio Neto</p>
                    <p className={`text-2xl font-bold ${totals.beneficio >= 0 ? 'text-white' : 'text-yellow-400'}`}>{formatCurrency(totals.beneficio)}</p>
                </div>
                <div className='bg-gray-800/50 p-4 rounded-lg border border-gray-700'>
                    <p className='text-sm text-gray-400 mb-1'>Retenciones (IRPF)</p>
                    <p className='text-2xl font-bold text-blue-400'>{formatCurrency(totals.totalRetenciones)}</p>
                </div>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                <div className='bg-gray-900 p-4 rounded-lg border border-gray-700 flex flex-col justify-between'>
                    <div>
                        <p className='text-sm text-gray-400 font-semibold mb-2'>Liquidación IVA (Modelo 303)</p>
                        <div className="flex justify-between text-sm mb-1 text-gray-300">
                            <span>Repercutido (+):</span>
                            <span>{formatCurrency(totals.ivaRepercutido)}</span>
                        </div>
                        <div className="flex justify-between text-sm mb-3 text-gray-300">
                            <span>Soportado (-):</span>
                            <span>{formatCurrency(totals.ivaSoportado)}</span>
                        </div>
                    </div>
                    <div className="border-t border-gray-700 pt-2 flex justify-between items-center">
                        <span className="text-gray-200 font-medium">A Pagar/Devolver:</span>
                        <span className={`text-xl font-bold ${totals.ivaAPagar >= 0 ? 'text-red-400' : 'text-green-400'}`}>
                            {formatCurrency(totals.ivaAPagar)}
                        </span>
                    </div>
                </div>

                <div className='bg-gray-900 p-4 rounded-lg border border-gray-700 flex flex-col justify-between'>
                    <div>
                        <p className='text-sm text-gray-400 font-semibold mb-2'>Pago Fraccionado IRPF (Modelo 130)</p>
                        <div className="flex justify-between text-sm mb-1 text-gray-300">
                            <span>Cuota ({irpfPercentage}% Beneficio):</span>
                            <span>{formatCurrency(totals.beneficio > 0 ? totals.beneficio * (irpfPercentage/100) : 0)}</span>
                        </div>
                        <div className="flex justify-between text-sm mb-3 text-gray-300">
                            <span>Retenciones Previas (-):</span>
                            <span>{formatCurrency(totals.totalRetenciones)}</span>
                        </div>
                    </div>
                    <div className="border-t border-gray-700 pt-2 flex justify-between items-center">
                        <span className="text-gray-200 font-medium">A Ingresar:</span>
                        <span className="text-xl font-bold text-white">
                            {formatCurrency(totals.irpfAPagar)}
                        </span>
                    </div>
                </div>
            </div>
            
            <div className="mt-4 flex items-start p-3 bg-blue-900/20 border border-blue-800 rounded text-xs text-blue-300">
                <AlertTriangleIcon className="w-4 h-4 mr-2 shrink-0 mt-0.5"/>
                <p>Esto es una simulación basada en tus datos registrados. Recuerda que para el Modelo 130 los importes son acumulativos anuales, aunque aquí se muestra una vista trimestral aislada para facilitar el control.</p>
            </div>
        </CardContent>
      </Card>

      <div className='grid grid-cols-1 lg:grid-cols-2 gap-6'>
        <Card>
            <CardHeader><h3 className='text-lg font-semibold text-white'>Facturas Emitidas (Ingresos)</h3></CardHeader>
            <CardContent className='p-0'>
                <div className="overflow-x-auto">
                    <table className='w-full text-left'>
                        <thead className="bg-gray-800/50 text-xs uppercase text-gray-400 font-medium">
                            <tr>
                                <th className="p-3">Fecha</th>
                                <th className="p-3">Factura</th>
                                <th className="p-3 text-right">Base</th>
                                <th className="p-3 text-right">IVA</th>
                                <th className="p-3 text-right">Ret.</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-800">
                        {filteredData.filteredInvoices.length > 0 ? filteredData.filteredInvoices.map(inv => (
                            <tr key={inv.id} className='hover:bg-gray-800/30'>
                                <td className='p-3 text-gray-300 whitespace-nowrap'>{inv.issue_date}</td>
                                <td className='p-3 text-white font-mono text-sm'>{inv.invoice_number}</td>
                                <td className='p-3 text-right font-medium text-green-400'>{formatCurrency(inv.subtotal_cents)}</td>
                                <td className='p-3 text-right text-gray-400 text-sm'>{formatCurrency(inv.subtotal_cents * (inv.tax_percent / 100))}</td>
                                <td className='p-3 text-right text-gray-400 text-sm'>{formatCurrency(inv.irpf_percent ? inv.subtotal_cents * (inv.irpf_percent/100) : 0)}</td>
                            </tr>
                        )) : (
                            <tr><td colSpan={5} className="p-4 text-center text-gray-500">No hay facturas en este periodo.</td></tr>
                        )}
                        </tbody>
                    </table>
                </div>
            </CardContent>
        </Card>
        <Card>
            <CardHeader><h3 className='text-lg font-semibold text-white'>Gastos Soportados</h3></CardHeader>
            <CardContent className='p-0'>
                <div className="overflow-x-auto">
                    <table className='w-full text-left'>
                        <thead className="bg-gray-800/50 text-xs uppercase text-gray-400 font-medium">
                            <tr>
                                <th className="p-3">Fecha</th>
                                <th className="p-3">Concepto</th>
                                <th className="p-3 text-right">Base</th>
                                <th className="p-3 text-right">IVA</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-800">
                        {filteredData.filteredExpenses.length > 0 ? filteredData.filteredExpenses.map(exp => (
                            <tr key={exp.id} className='hover:bg-gray-800/30'>
                                <td className='p-3 text-gray-300 whitespace-nowrap'>{exp.date}</td>
                                <td className='p-3 text-white'>{exp.description}</td>
                                <td className='p-3 text-right font-medium text-red-400'>{formatCurrency(exp.amount_cents)}</td>
                                <td className='p-3 text-right text-gray-400 text-sm'>{formatCurrency(exp.amount_cents * ((exp.tax_percent || 0)/100))}</td>
                            </tr>
                        )) : (
                            <tr><td colSpan={4} className="p-4 text-center text-gray-500">No hay gastos en este periodo.</td></tr>
                        )}
                        </tbody>
                    </table>
                </div>
            </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default TaxLedgerPage;
