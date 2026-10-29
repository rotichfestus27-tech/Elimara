import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Boxes, Eye, Pencil, Plus, Search } from "lucide-react";
import { type FormEvent, useRef, useState } from "react";
import { useAuth } from "@/app/auth-provider";
import { DashboardDataTable } from "@/components/dashboard/dashboard-primitives";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  EmptyState,
  ErrorState,
  LoadingState,
  UnauthorizedState,
} from "@/components/ui/data-states";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ApiClientError, apiRequest } from "@/lib/api/client";
import { useSchoolData, useSchoolList } from "@/lib/api/school-data";

type LibraryItem = {
  id: string;
  title: string;
  author: string | null;
  isbn: string | null;
  categoryId: string | null;
  archivedAt: string | null;
};

type LibraryCategory = {
  id: string;
  name: string;
  archivedAt: string | null;
};

const pageSize = 25;

export function LibraryCatalogWorkspace({
  canReadCatalog,
  canManageCatalog,
}: {
  canReadCatalog: boolean;
  canManageCatalog: boolean;
}) {
  const [search, setSearch] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [offset, setOffset] = useState(0);
  const [detailsItemId, setDetailsItemId] = useState<string | null>(null);
  const [inventoryItem, setInventoryItem] = useState<LibraryItem | null>(null);
  const [formItem, setFormItem] = useState<LibraryItem | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [notice, setNotice] = useState("");

  const normalizedSearch = search.trim();
  const categoriesQuery = useSchoolList<LibraryCategory>(
    "/library/categories",
    { limit: 100, offset: 0, includeArchived: "true" },
    { enabled: canReadCatalog },
  );
  const catalogQuery = useSchoolList<LibraryItem>(
    "/library/catalog/items",
    {
      limit: pageSize,
      offset,
      includeArchived: "true",
      search: normalizedSearch || undefined,
      categoryId: categoryId || undefined,
    },
    { enabled: canReadCatalog },
  );
  const detailsPath = `/library/catalog/items/${encodeURIComponent(detailsItemId ?? "")}`;
  const detailsQuery = useSchoolData<{ data: LibraryItem }>(
    detailsPath,
    {},
    { enabled: canReadCatalog && detailsItemId !== null },
  );
  const categories = categoriesQuery.data?.data ?? [];
  const categoryNames = new Map(categories.map((category) => [category.id, category.name]));
  const catalogItems = catalogQuery.data?.data ?? [];
  const total = catalogQuery.data?.meta.total ?? 0;
  const canSelectCategory = canReadCatalog && categoriesQuery.data !== undefined;

  function closeForm() {
    setFormOpen(false);
    setFormItem(null);
  }

  function openCreateForm() {
    setNotice("");
    setFormItem(null);
    setFormOpen(true);
  }

  function openEditForm(item: LibraryItem) {
    setNotice("");
    setFormItem(item);
    setFormOpen(true);
  }

  return (
    <Card className="shadow-none">
      <CardHeader className="gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1.5">
          <CardTitle className="text-base">Book catalog</CardTitle>
          <p className="text-sm text-muted-foreground">
            Search by title and filter by category. Catalog metadata is school scoped.
          </p>
        </div>
        {canManageCatalog && (
          <Button className="w-full shrink-0 sm:w-auto" onClick={openCreateForm} size="sm">
            <Plus aria-hidden="true" />
            Register book
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {notice && (
          <p
            className="rounded-md border border-primary/20 bg-primary/5 px-3 py-2 text-sm"
            role="status"
          >
            {notice}
          </p>
        )}

        {canReadCatalog ? (
          <>
            <div className="grid gap-3 sm:grid-cols-[minmax(12rem,1fr)_minmax(12rem,0.7fr)]">
              <label className="space-y-1.5 text-sm">
                <span className="text-xs font-medium text-muted-foreground">Search title</span>
                <span className="relative block">
                  <Search
                    aria-hidden="true"
                    className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                  />
                  <input
                    className="h-10 w-full rounded-md border border-input bg-background pl-9 pr-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    maxLength={120}
                    onChange={(event) => {
                      setSearch(event.target.value);
                      setOffset(0);
                    }}
                    placeholder="Search book titles"
                    type="search"
                    value={search}
                  />
                </span>
              </label>
              <label className="space-y-1.5 text-sm">
                <span className="text-xs font-medium text-muted-foreground">Category</span>
                <select
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  onChange={(event) => {
                    setCategoryId(event.target.value);
                    setOffset(0);
                  }}
                  value={categoryId}
                >
                  <option value="">All categories</option>
                  {categories
                    .filter((category) => !category.archivedAt)
                    .map((category) => (
                      <option key={category.id} value={category.id}>
                        {category.name}
                      </option>
                    ))}
                </select>
              </label>
            </div>

            {categoriesQuery.isError &&
              (isPermissionDenied(categoriesQuery.error) ? (
                <UnauthorizedState
                  description="The server denied access to Library categories in the current school context. You can still search the catalog."
                  title="Category access denied"
                />
              ) : (
                <ErrorState
                  message="Categories could not be loaded. You can still search the catalog."
                  onRetry={() => void categoriesQuery.refetch()}
                />
              ))}
            {catalogQuery.isPending ? (
              <LoadingState className="min-h-40" message="Loading catalog..." />
            ) : catalogQuery.isError ? (
              isPermissionDenied(catalogQuery.error) ? (
                <UnauthorizedState
                  description="The server denied access to catalog records in the current school context."
                  title="Catalog access denied"
                />
              ) : (
                <ErrorState onRetry={() => void catalogQuery.refetch()} />
              )
            ) : catalogItems.length === 0 ? (
              <EmptyState
                className="min-h-40 justify-center"
                description={
                  normalizedSearch || categoryId
                    ? "Try another title search or category."
                    : "Register a book to start the school catalog."
                }
                title={normalizedSearch || categoryId ? "No matching books" : "Catalog is empty"}
              />
            ) : (
              <>
                <DashboardDataTable
                  caption="School library book catalog"
                  className="max-h-[34rem]"
                  headers={["Title", "Author", "ISBN", "Category", "Status", "Actions"]}
                >
                  {catalogItems.map((item) => (
                    <tr className="border-t align-middle" key={item.id}>
                      <th className="min-w-48 px-4 py-3 text-left font-medium" scope="row">
                        {item.title}
                      </th>
                      <td className="min-w-32 px-4 py-3 text-muted-foreground">
                        {item.author ?? "Not provided"}
                      </td>
                      <td className="min-w-28 px-4 py-3 text-muted-foreground">
                        {item.isbn ?? "Not provided"}
                      </td>
                      <td className="min-w-32 px-4 py-3 text-muted-foreground">
                        {item.categoryId
                          ? (categoryNames.get(item.categoryId) ?? "Category unavailable")
                          : "Uncategorized"}
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant={item.archivedAt ? "outline" : "secondary"}>
                          {item.archivedAt ? "Archived" : "Active"}
                        </Badge>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          <Button
                            aria-label={`View copies for ${item.title}`}
                            onClick={() => setInventoryItem(item)}
                            size="icon"
                            title="View physical copies"
                            variant="ghost"
                          >
                            <Boxes aria-hidden="true" />
                          </Button>
                          <Button
                            aria-label={`View ${item.title} details`}
                            onClick={() => setDetailsItemId(item.id)}
                            size="icon"
                            title="View book details"
                            variant="ghost"
                          >
                            <Eye aria-hidden="true" />
                          </Button>
                          {canManageCatalog && !item.archivedAt && (
                            <Button
                              aria-label={`Edit ${item.title}`}
                              onClick={() => openEditForm(item)}
                              size="icon"
                              title="Edit book details"
                              variant="ghost"
                            >
                              <Pencil aria-hidden="true" />
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </DashboardDataTable>
                <div className="flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
                  <p aria-live="polite" className="text-sm text-muted-foreground">
                    Showing {offset + 1}-{Math.min(offset + catalogItems.length, total)} of {total}
                  </p>
                  <div className="flex gap-2">
                    <Button
                      disabled={offset === 0}
                      onClick={() => setOffset((current) => Math.max(0, current - pageSize))}
                      size="sm"
                      variant="outline"
                    >
                      Previous
                    </Button>
                    <Button
                      disabled={offset + pageSize >= total}
                      onClick={() => setOffset((current) => current + pageSize)}
                      size="sm"
                      variant="outline"
                    >
                      Next
                    </Button>
                  </div>
                </div>
              </>
            )}
          </>
        ) : (
          <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
            Catalog reading permission is not available. Book registration is limited to the catalog
            management permission.
          </p>
        )}
      </CardContent>

      <Dialog
        onOpenChange={(open) => !open && setDetailsItemId(null)}
        open={detailsItemId !== null}
      >
        <DialogContent className="max-h-[85vh] w-[calc(100%-2rem)] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Book details</DialogTitle>
            <DialogDescription>
              Catalog metadata returned by the school Library API.
            </DialogDescription>
          </DialogHeader>
          {detailsQuery.isPending ? (
            <LoadingState className="min-h-32" message="Loading book details..." />
          ) : detailsQuery.isError ? (
            isPermissionDenied(detailsQuery.error) ? (
              <UnauthorizedState
                description="The server denied access to this catalog record in the current school context."
                title="Book details access denied"
              />
            ) : (
              <ErrorState onRetry={() => void detailsQuery.refetch()} />
            )
          ) : detailsQuery.data ? (
            <dl className="grid gap-x-5 gap-y-4 py-2 sm:grid-cols-2">
              <DetailField label="Title" value={detailsQuery.data.data.title} />
              <DetailField label="Author" value={detailsQuery.data.data.author} />
              <DetailField label="ISBN" value={detailsQuery.data.data.isbn} />
              <DetailField
                label="Category"
                value={
                  detailsQuery.data.data.categoryId
                    ? (categoryNames.get(detailsQuery.data.data.categoryId) ??
                      detailsQuery.data.data.categoryId)
                    : null
                }
              />
              <DetailField
                label="Status"
                value={detailsQuery.data.data.archivedAt ? "Archived" : "Active"}
              />
            </dl>
          ) : null}
        </DialogContent>
      </Dialog>

      {inventoryItem && canReadCatalog && (
        <LibraryCopyInventoryDialog
          canManageCatalog={canManageCatalog}
          item={inventoryItem}
          onClose={() => setInventoryItem(null)}
        />
      )}

      {formOpen && canManageCatalog && (
        <LibraryItemFormDialog
          canSelectCategory={canSelectCategory}
          categories={categories}
          item={formItem}
          onClose={closeForm}
          onSaved={(message) => {
            setNotice(message);
            closeForm();
          }}
        />
      )}
    </Card>
  );
}

type LibraryCopy = {
  id: string;
  itemId: string;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

function LibraryCopyInventoryDialog({
  canManageCatalog,
  item,
  onClose,
}: {
  canManageCatalog: boolean;
  item: LibraryItem;
  onClose: () => void;
}) {
  const { school } = useAuth();
  const queryClient = useQueryClient();
  const [offset, setOffset] = useState(0);
  const [notice, setNotice] = useState("");
  const [mutationError, setMutationError] = useState("");
  const submissionLock = useRef(false);
  const pageSize = 25;
  const copiesPath = `/library/catalog/items/${encodeURIComponent(item.id)}/copies`;
  const copiesQuery = useSchoolList<LibraryCopy>(copiesPath, {
    limit: pageSize,
    offset,
    includeArchived: "true",
  });
  const copies = copiesQuery.data?.data ?? [];
  const total = copiesQuery.data?.meta.total ?? 0;

  const addCopyMutation = useMutation({
    mutationFn: async () => {
      if (!school?.id) throw new Error("Select a school before registering a copy.");
      return apiRequest<{ data: LibraryCopy }>(
        `/schools/${encodeURIComponent(school.id)}${copiesPath}`,
        { method: "POST" },
      );
    },
    onSuccess: async () => {
      if (!school?.id) return;
      setNotice("Physical copy registered.");
      setMutationError("");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["school-data", school.id, copiesPath] }),
        queryClient.invalidateQueries({
          queryKey: ["school-data", school.id, "/library/catalog/items"],
        }),
      ]);
    },
    onError: (error) => {
      setMutationError(
        error instanceof Error ? error.message : "The copy could not be registered.",
      );
    },
    onSettled: () => {
      submissionLock.current = false;
    },
  });

  function registerCopy() {
    setNotice("");
    setMutationError("");
    if (!canManageCatalog || item.archivedAt || submissionLock.current) return;
    submissionLock.current = true;
    addCopyMutation.mutate();
  }

  return (
    <Dialog onOpenChange={(open) => !open && !addCopyMutation.isPending && onClose()} open>
      <DialogContent className="max-h-[90vh] w-[calc(100%-2rem)] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Physical copies</DialogTitle>
          <DialogDescription className="break-words">
            {item.title} · Copy identifiers and archived records returned by the Library API.
            Availability and shelf locations are not provided by this endpoint.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          {canManageCatalog && !item.archivedAt && (
            <Button
              disabled={addCopyMutation.isPending}
              onClick={registerCopy}
              size="sm"
              type="button"
            >
              <Plus aria-hidden="true" />
              {addCopyMutation.isPending ? "Registering..." : "Add physical copy"}
            </Button>
          )}
          {notice && (
            <p
              className="rounded-md border border-primary/20 bg-primary/5 px-3 py-2 text-sm"
              role="status"
            >
              {notice}
            </p>
          )}
          {mutationError && (
            <p
              className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
              role="alert"
            >
              {mutationError}
            </p>
          )}
          {copiesQuery.isPending ? (
            <LoadingState className="min-h-32" message="Loading physical copies..." />
          ) : copiesQuery.error instanceof ApiClientError && copiesQuery.error.status === 403 ? (
            <UnauthorizedState
              description="The server denied access to this title's physical copy inventory."
              title="Copy inventory access unavailable"
            />
          ) : copiesQuery.isError ? (
            <ErrorState onRetry={() => void copiesQuery.refetch()} />
          ) : copies.length === 0 ? (
            <EmptyState
              className="min-h-32 justify-center"
              description="No physical copies have been registered for this title."
              title="No physical copies"
            />
          ) : (
            <>
              <DashboardDataTable
                caption={`Physical copies of ${item.title}`}
                headers={["Copy identifier", "Record status", "Registered"]}
              >
                {copies.map((copy) => (
                  <tr className="border-t" key={copy.id}>
                    <th
                      className="max-w-64 break-all px-4 py-3 text-left font-mono text-xs"
                      scope="row"
                    >
                      {copy.id}
                    </th>
                    <td className="px-4 py-3">
                      <Badge variant={copy.archivedAt ? "outline" : "secondary"}>
                        {copy.archivedAt ? "Archived" : "Active record"}
                      </Badge>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                      {new Date(copy.createdAt).toLocaleDateString("en-GB", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                    </td>
                  </tr>
                ))}
              </DashboardDataTable>
              <div className="flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
                <p aria-live="polite" className="text-sm text-muted-foreground">
                  Showing {offset + 1}-{Math.min(offset + copies.length, total)} of {total} copies
                </p>
                <div className="flex gap-2">
                  <Button
                    disabled={offset === 0}
                    onClick={() => setOffset((current) => Math.max(0, current - pageSize))}
                    size="sm"
                    variant="outline"
                  >
                    Previous
                  </Button>
                  <Button
                    disabled={offset + pageSize >= total}
                    onClick={() => setOffset((current) => current + pageSize)}
                    size="sm"
                    variant="outline"
                  >
                    Next
                  </Button>
                </div>
              </div>
            </>
          )}
        </div>
        <DialogFooter>
          <Button onClick={onClose} type="button" variant="outline">
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DetailField({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="min-w-0 space-y-1">
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className="break-words text-sm">{value || "Not provided"}</dd>
    </div>
  );
}

function isPermissionDenied(error: Error | null): boolean {
  return error instanceof ApiClientError && error.status === 403;
}

function LibraryItemFormDialog({
  canSelectCategory,
  categories,
  item,
  onClose,
  onSaved,
}: {
  canSelectCategory: boolean;
  categories: LibraryCategory[];
  item: LibraryItem | null;
  onClose: () => void;
  onSaved(message: string): void;
}) {
  const { school } = useAuth();
  const queryClient = useQueryClient();
  const [title, setTitle] = useState(item?.title ?? "");
  const [author, setAuthor] = useState(item?.author ?? "");
  const [isbn, setIsbn] = useState(item?.isbn ?? "");
  const [categoryId, setCategoryId] = useState(item?.categoryId ?? "");
  const [formError, setFormError] = useState("");
  const submissionLock = useRef(false);
  const itemPath = item ? `/library/catalog/items/${encodeURIComponent(item.id)}` : null;

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!school?.id) throw new Error("Select a school before saving a catalog record.");
      const payload = {
        title: title.trim(),
        author: author.trim() || null,
        isbn: isbn.trim() || null,
        ...(canSelectCategory && (!item || (categoryId || null) !== item.categoryId)
          ? { categoryId: categoryId || null }
          : {}),
      };
      const result = itemPath
        ? await apiRequest<{ data: LibraryItem }>(
            `/schools/${encodeURIComponent(school.id)}${itemPath}`,
            { method: "PATCH", body: payload },
          )
        : await apiRequest<{ data: LibraryItem }>(
            `/schools/${encodeURIComponent(school.id)}/library/catalog/items`,
            { method: "POST", body: payload },
          );
      return result.data;
    },
    onSuccess: async (savedItem) => {
      if (!school?.id) return;
      await queryClient.invalidateQueries({
        queryKey: ["school-data", school.id, "/library/catalog/items"],
      });
      if (itemPath) {
        await queryClient.invalidateQueries({
          queryKey: ["school-data", school.id, itemPath],
        });
      }
      onSaved(item ? `Updated “${savedItem.title}”.` : `Registered “${savedItem.title}”.`);
    },
    onError: (error) => {
      setFormError(
        error instanceof Error ? error.message : "The catalog record could not be saved.",
      );
    },
    onSettled: () => {
      submissionLock.current = false;
    },
  });

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError("");
    const trimmedTitle = title.trim();
    const trimmedAuthor = author.trim();
    const trimmedIsbn = isbn.trim();
    if (!trimmedTitle || trimmedTitle.length > 240) {
      setFormError("Title is required and must be 240 characters or fewer.");
      return;
    }
    if (trimmedAuthor.length > 240) {
      setFormError("Author must be between 1 and 240 characters when provided.");
      return;
    }
    if (trimmedIsbn.length > 24) {
      setFormError("ISBN must be between 1 and 24 characters when provided.");
      return;
    }
    if (submissionLock.current || saveMutation.isPending) return;
    submissionLock.current = true;
    saveMutation.mutate();
  }

  return (
    <Dialog onOpenChange={(open) => !open && !saveMutation.isPending && onClose()} open>
      <DialogContent className="max-h-[90vh] w-[calc(100%-2rem)] overflow-y-auto sm:max-w-xl">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>{item ? "Edit book" : "Register book"}</DialogTitle>
            <DialogDescription>
              Enter the catalog fields supported by the Library API. Title search does not match
              author or ISBN.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-5 sm:grid-cols-2">
            <label className="space-y-1.5 text-sm sm:col-span-2">
              <span className="text-xs font-medium text-muted-foreground">Title</span>
              <input
                autoFocus
                className="h-10 w-full rounded-md border border-input bg-background px-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                maxLength={240}
                onChange={(event) => setTitle(event.target.value)}
                required
                value={title}
              />
            </label>
            <label className="space-y-1.5 text-sm">
              <span className="text-xs font-medium text-muted-foreground">Author</span>
              <input
                className="h-10 w-full rounded-md border border-input bg-background px-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                maxLength={240}
                onChange={(event) => setAuthor(event.target.value)}
                value={author}
              />
            </label>
            <label className="space-y-1.5 text-sm">
              <span className="text-xs font-medium text-muted-foreground">ISBN</span>
              <input
                className="h-10 w-full rounded-md border border-input bg-background px-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                maxLength={24}
                onChange={(event) => setIsbn(event.target.value)}
                value={isbn}
              />
            </label>
            {canSelectCategory && (
              <label className="space-y-1.5 text-sm sm:col-span-2">
                <span className="text-xs font-medium text-muted-foreground">Category</span>
                <select
                  className="h-10 w-full rounded-md border border-input bg-background px-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  onChange={(event) => setCategoryId(event.target.value)}
                  value={categoryId}
                >
                  <option value="">No category</option>
                  {categories
                    .filter((category) => !category.archivedAt)
                    .map((category) => (
                      <option key={category.id} value={category.id}>
                        {category.name}
                      </option>
                    ))}
                  {categoryId &&
                    categories.some(
                      (category) => category.id === categoryId && category.archivedAt,
                    ) && (
                      <option value={categoryId}>
                        {categories.find((category) => category.id === categoryId)?.name ??
                          "Archived category"}{" "}
                        (archived)
                      </option>
                    )}
                </select>
              </label>
            )}
            {formError && (
              <p
                className="rounded-md bg-destructive/10 p-3 text-sm text-destructive sm:col-span-2"
                role="alert"
              >
                {formError}
              </p>
            )}
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              disabled={saveMutation.isPending}
              onClick={onClose}
              type="button"
              variant="outline"
            >
              Cancel
            </Button>
            <Button disabled={saveMutation.isPending} type="submit">
              {saveMutation.isPending ? "Saving..." : item ? "Save changes" : "Register book"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
