import { useState, useRef, FormEvent, useEffect } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useRecipe, useUpdateRecipe, useSaveRecipeContent, useUploadCoverImage, RecipeIngredient, Instruction, Tag } from '../../api/recipes'
import { Button } from '../../components/ui/Button'
import { Input, Textarea } from '../../components/ui/Input'
import { useMobile } from '../../hooks/useMobile'

interface IngredientRow {
  raw_text: string
  group_label: string
  is_optional: boolean
}

interface InstructionRow {
  body: string
  group_label: string
}

const inputStyle = {
  padding: '8px 10px',
  borderRadius: 'var(--radius-md)',
  border: '1px solid var(--color-border)',
  background: 'var(--color-surface)',
  fontSize: '14px',
  color: 'var(--color-text)',
  fontFamily: 'var(--font-sans)',
}

export default function RecipeEditPage() {
  const isMobile = useMobile()
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { data: recipe, isLoading } = useRecipe(id!)
  const updateMeta = useUpdateRecipe(id!)
  const saveContent = useSaveRecipeContent(id!)
  const uploadCover = useUploadCoverImage(id!)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [coverPreview, setCoverPreview] = useState<string | null>(null)

  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [cuisine, setCuisine] = useState('')
  const [difficulty, setDifficulty] = useState<'' | 'easy' | 'medium' | 'hard'>('')
  const [prepTime, setPrepTime] = useState('')
  const [cookTime, setCookTime] = useState('')
  const [servings, setServings] = useState('')

  const [ingredients, setIngredients] = useState<IngredientRow[]>([])
  const [instructions, setInstructions] = useState<InstructionRow[]>([])
  const [tagInput, setTagInput] = useState('')
  const [tags, setTags] = useState<string[]>([])

  const [error, setError] = useState('')

  useEffect(() => {
    if (!recipe) return
    setTitle(recipe.title ?? '')
    setDescription(recipe.description ?? '')
    setCuisine(recipe.cuisine ?? '')
    setDifficulty(recipe.difficulty ?? '')
    setPrepTime(recipe.prep_time_mins ? String(recipe.prep_time_mins) : '')
    setCookTime(recipe.cook_time_mins ? String(recipe.cook_time_mins) : '')
    setServings(recipe.base_servings ? String(recipe.base_servings) : '')
    setIngredients(
      (recipe.ingredients ?? []).map((i: RecipeIngredient) => ({
        raw_text: i.raw_text,
        group_label: i.group_label ?? '',
        is_optional: i.is_optional ?? false,
      }))
    )
    setInstructions(
      (recipe.instructions ?? []).map((s: Instruction) => ({
        body: s.body,
        group_label: s.group_label ?? '',
      }))
    )
    setTags((recipe.tags ?? []).map((t: Tag) => t.name))
  }, [recipe])

  async function handleSave(e: FormEvent) {
    e.preventDefault()
    setError('')
    if (!title.trim()) { setError('Title is required.'); return }
    try {
      await updateMeta.mutateAsync({
        title: title.trim(),
        description: description.trim() || null,
        cuisine: cuisine.trim() || null,
        difficulty: (difficulty || null) as 'easy' | 'medium' | 'hard' | null,
        prep_time_mins: prepTime ? parseInt(prepTime) : null,
        cook_time_mins: cookTime ? parseInt(cookTime) : null,
        base_servings: servings ? parseInt(servings) : null,
      })
      await saveContent.mutateAsync({
        ingredients: ingredients
          .filter((i) => i.raw_text.trim())
          .map((i, idx) => ({
            raw_text: i.raw_text.trim(),
            group_label: i.group_label.trim() || null,
            is_optional: i.is_optional,
            display_order: idx,
          })),
        instructions: instructions
          .filter((s) => s.body.trim())
          .map((s, idx) => ({
            body: s.body.trim(),
            group_label: s.group_label.trim() || null,
            step_number: idx + 1,
          })),
        tags: tags,
      })
      navigate(`/recipes/${id}`)
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string; errors?: { msg: string }[] } } })?.response?.data
      const detail = msg?.error ?? msg?.errors?.[0]?.msg ?? 'Save failed. Please try again.'
      setError(detail)
    }
  }

  function addIngredient() {
    setIngredients([...ingredients, { raw_text: '', group_label: '', is_optional: false }])
  }
  function removeIngredient(i: number) {
    setIngredients(ingredients.filter((_, idx) => idx !== i))
  }
  function updateIngredient(i: number, field: keyof IngredientRow, value: string | boolean) {
    setIngredients(ingredients.map((row, idx) => idx === i ? { ...row, [field]: value } : row))
  }

  function addInstruction() {
    setInstructions([...instructions, { body: '', group_label: '' }])
  }
  function removeInstruction(i: number) {
    setInstructions(instructions.filter((_, idx) => idx !== i))
  }
  function updateInstruction(i: number, field: keyof InstructionRow, value: string) {
    setInstructions(instructions.map((row, idx) => idx === i ? { ...row, [field]: value } : row))
  }
  function moveInstruction(i: number, dir: -1 | 1) {
    const next = [...instructions]
    const j = i + dir
    if (j < 0 || j >= next.length) return
    ;[next[i], next[j]] = [next[j], next[i]]
    setInstructions(next)
  }

  function addTag() {
    const t = tagInput.trim().toLowerCase()
    if (t && !tags.includes(t)) setTags([...tags, t])
    setTagInput('')
  }
  function removeTag(t: string) {
    setTags(tags.filter((x) => x !== t))
  }

  if (isLoading) return <div style={{ color: 'var(--color-text-muted)', fontSize: '14px' }}>Loading...</div>
  if (!recipe) return <div style={{ color: 'var(--color-text-muted)', fontSize: '14px' }}>Recipe not found.</div>

  const isPending = updateMeta.isPending || saveContent.isPending

  return (
    <div style={{ maxWidth: '720px' }}>
      <Link
        to={`/recipes/${id}`}
        style={{ fontSize: '13px', color: 'var(--color-primary)', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '4px', marginBottom: '20px' }}
      >
        ← Back to recipe
      </Link>

      <h1 style={{ fontSize: '24px', fontWeight: 700, marginBottom: '28px' }}>Edit Recipe</h1>

      <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>

        {/* Cover photo */}
        <section>
          <h2 style={{ fontSize: '13px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--color-text-muted)', marginBottom: '16px' }}>Cover Photo</h2>
          <div
            onClick={() => fileInputRef.current?.click()}
            style={{
              position: 'relative', width: '100%', height: '200px', borderRadius: 'var(--radius-lg)',
              overflow: 'hidden', cursor: 'pointer', border: '2px dashed var(--color-border)',
              background: 'var(--color-surface)', display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            {(coverPreview ?? recipe.cover_url) ? (
              <>
                <img
                  src={coverPreview ?? recipe.cover_url ?? ''}
                  alt="Cover"
                  style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                />
                <div style={{
                  position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.35)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  opacity: 0, transition: 'opacity 0.15s',
                }}
                  onMouseEnter={e => (e.currentTarget.style.opacity = '1')}
                  onMouseLeave={e => (e.currentTarget.style.opacity = '0')}
                >
                  <span style={{ color: '#fff', fontSize: '14px', fontWeight: 600 }}>
                    {uploadCover.isPending ? 'Uploading…' : '📷 Change photo'}
                  </span>
                </div>
              </>
            ) : (
              <div style={{ textAlign: 'center', color: 'var(--color-text-muted)' }}>
                <div style={{ fontSize: '32px', marginBottom: '8px' }}>📷</div>
                <p style={{ fontSize: '14px', fontWeight: 500 }}>
                  {uploadCover.isPending ? 'Uploading…' : 'Click to add a cover photo'}
                </p>
                <p style={{ fontSize: '12px', marginTop: '4px' }}>JPG, PNG or WebP · max 10 MB</p>
              </div>
            )}
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            style={{ display: 'none' }}
            onChange={async (e) => {
              const file = e.target.files?.[0]
              if (!file) return
              setCoverPreview(URL.createObjectURL(file))
              await uploadCover.mutateAsync(file)
              e.target.value = ''
            }}
          />
          {uploadCover.isError && (
            <p style={{ fontSize: '12px', color: '#dc2626', marginTop: '8px' }}>Upload failed — please try again.</p>
          )}
        </section>

        {/* Details */}
        <section>
          <h2 style={{ fontSize: '13px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--color-text-muted)', marginBottom: '16px' }}>Details</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <Input label="Title" value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
            <Textarea label="Description" value={description} onChange={(e) => setDescription(e.target.value)} style={{ minHeight: '100px' }} />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
              <Input label="Cuisine" value={cuisine} onChange={(e) => setCuisine(e.target.value)} placeholder="e.g. Italian" />
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '13px', fontWeight: 500, color: 'var(--color-text)' }}>Difficulty</label>
                <select
                  value={difficulty}
                  onChange={(e) => setDifficulty(e.target.value as '' | 'easy' | 'medium' | 'hard')}
                  style={{ ...inputStyle, width: '100%' }}
                >
                  <option value="">—</option>
                  <option value="easy">Easy</option>
                  <option value="medium">Medium</option>
                  <option value="hard">Hard</option>
                </select>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '14px' }}>
              <Input label="Prep time (mins)" type="number" value={prepTime} onChange={(e) => setPrepTime(e.target.value)} placeholder="15" />
              <Input label="Cook time (mins)" type="number" value={cookTime} onChange={(e) => setCookTime(e.target.value)} placeholder="30" />
              <Input label="Base servings" type="number" value={servings} onChange={(e) => setServings(e.target.value)} placeholder="4" />
            </div>
          </div>
        </section>

        {/* Ingredients */}
        <section>
          <h2 style={{ fontSize: '13px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--color-text-muted)', marginBottom: '16px' }}>Ingredients</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {ingredients.map((ing, i) => (
              <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                {/* Row 1: ingredient text + delete */}
                <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                  <input
                    value={ing.raw_text}
                    onChange={(e) => updateIngredient(i, 'raw_text', e.target.value)}
                    placeholder="e.g. 2 cups flour"
                    style={{ ...inputStyle, flex: 1, minWidth: 0 }}
                  />
                  <button
                    type="button"
                    onClick={() => removeIngredient(i)}
                    style={{ background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer', fontSize: '20px', lineHeight: 1, padding: '4px', flexShrink: 0 }}
                  >×</button>
                </div>
                {/* Row 2: group label + optional checkbox */}
                <div style={{ display: 'flex', gap: '6px', alignItems: 'center', paddingRight: isMobile ? '30px' : '0' }}>
                  <input
                    value={ing.group_label}
                    onChange={(e) => updateIngredient(i, 'group_label', e.target.value)}
                    placeholder="Group (optional)"
                    style={{ ...inputStyle, flex: 1, minWidth: 0, fontSize: '12px' }}
                  />
                  <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px', color: 'var(--color-text-muted)', cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0 }}>
                    <input
                      type="checkbox"
                      checked={ing.is_optional}
                      onChange={(e) => updateIngredient(i, 'is_optional', e.target.checked)}
                    />
                    Optional
                  </label>
                </div>
              </div>
            ))}
            <Button type="button" variant="ghost" onClick={addIngredient} style={{ alignSelf: 'flex-start' }}>
              + Add ingredient
            </Button>
          </div>
        </section>

        {/* Instructions */}
        <section>
          <h2 style={{ fontSize: '13px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--color-text-muted)', marginBottom: '16px' }}>Instructions</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {instructions.map((step, i) => (
              <div key={i} style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                <span style={{
                  width: '28px', height: '28px', borderRadius: '50%',
                  background: 'var(--color-border)', color: 'var(--color-text-muted)',
                  fontSize: '13px', fontWeight: 700, flexShrink: 0, marginTop: '10px',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>{i + 1}</span>
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <textarea
                    value={step.body}
                    onChange={(e) => updateInstruction(i, 'body', e.target.value)}
                    placeholder="Describe this step..."
                    style={{ ...inputStyle, resize: 'vertical', minHeight: '72px', width: '100%' }}
                  />
                  <input
                    value={step.group_label}
                    onChange={(e) => updateInstruction(i, 'group_label', e.target.value)}
                    placeholder="Section label (optional)"
                    style={{ ...inputStyle, fontSize: '13px' }}
                  />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '8px' }}>
                  <button
                    type="button"
                    onClick={() => moveInstruction(i, -1)}
                    disabled={i === 0}
                    style={{ background: 'none', border: '1px solid var(--color-border)', borderRadius: '4px', cursor: i === 0 ? 'default' : 'pointer', opacity: i === 0 ? 0.3 : 1, padding: '2px 6px', fontSize: '12px' }}
                  >↑</button>
                  <button
                    type="button"
                    onClick={() => moveInstruction(i, 1)}
                    disabled={i === instructions.length - 1}
                    style={{ background: 'none', border: '1px solid var(--color-border)', borderRadius: '4px', cursor: i === instructions.length - 1 ? 'default' : 'pointer', opacity: i === instructions.length - 1 ? 0.3 : 1, padding: '2px 6px', fontSize: '12px' }}
                  >↓</button>
                  <button
                    type="button"
                    onClick={() => removeInstruction(i)}
                    style={{ background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer', fontSize: '20px', lineHeight: 1, padding: '2px' }}
                  >×</button>
                </div>
              </div>
            ))}
            <Button type="button" variant="ghost" onClick={addInstruction} style={{ alignSelf: 'flex-start' }}>
              + Add step
            </Button>
          </div>
        </section>

        {/* Tags */}
        <section>
          <h2 style={{ fontSize: '13px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--color-text-muted)', marginBottom: '16px' }}>Tags</h2>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '10px' }}>
            {tags.map((t) => (
              <span key={t} style={{ fontSize: '12px', background: 'var(--color-border)', color: 'var(--color-text)', padding: '4px 10px', borderRadius: '999px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                {t}
                <button
                  type="button"
                  onClick={() => removeTag(t)}
                  style={{ background: 'none', border: 'none', color: 'var(--color-text-muted)', cursor: 'pointer', padding: 0, lineHeight: 1, fontSize: '14px' }}
                >×</button>
              </span>
            ))}
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <input
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addTag() } }}
              placeholder="Add a tag..."
              style={{ ...inputStyle, flex: 1, maxWidth: '200px' }}
            />
            <Button type="button" variant="ghost" onClick={addTag}>Add</Button>
          </div>
        </section>

        {error && <p style={{ fontSize: '13px', color: '#dc2626', margin: 0 }}>{error}</p>}

        <div style={{ display: 'flex', gap: '12px' }}>
          <Button type="submit" loading={isPending}>Save Changes</Button>
          <Button type="button" variant="ghost" onClick={() => navigate(`/recipes/${id}`)}>Cancel</Button>
        </div>
      </form>
    </div>
  )
}
